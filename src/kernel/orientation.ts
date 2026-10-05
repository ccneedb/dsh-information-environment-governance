/**
 * IEG kernel — orientation capture and its enforcement gate.
 *
 * The behavioural evaluation exposed a real defect: the `agent/pre-step`
 * orientation gate could never be satisfied, because nothing in the plugin ever
 * populated project state. `orientationGate: 'reject'` would therefore have
 * blocked every step forever.
 *
 * This module closes that loop. It gives the agent one explicit way to declare
 * orientation, and it refuses the first persistent workspace mutation until that
 * declaration exists. That converts objective 1 ("proactively align intent and
 * terminology and plan the global task flow, without waiting for user
 * reminders") from a hope about prose into a mechanically enforced step.
 *
 * The gate fires at most once per session, before the first mutation, so it
 * costs one extra tool call rather than adding friction to every action.
 */

import { serialiseGlossary } from './glossary.js'
import { applyProjectEvent, createProjectState, orientationStatus } from '../modules/project-governance.js'

/** The model-facing tool that records orientation. */
export const ORIENTATION_TOOL_NAME = 'record_orientation'

/**
 * The model-facing tool that *requests* user confirmation of a term (R8-01).
 *
 * It is registered like any other tool, but the host routes every call through its
 * approval service before the body below runs, so the model cannot manufacture a
 * confirmed entry: the user's approval is the authority, and a denial means
 * `confirmTerm` is never reached.
 */
export const CONFIRM_TOOL_NAME = 'confirm_terminology'

/** Raised when a tool call supplies an orientation the contract rejects. */
export class OrientationError extends Error {
  constructor(message: string) {
    super(`ieg orientation: ${message}`)
    this.name = 'OrientationError'
  }
}

/**
 * Assert a value is a non-empty string.
 */
function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OrientationError(`"${field}" is required and must be a non-empty string`)
  }
  return value.trim()
}

/** The orientation store's public surface. */
interface OrientationStore {
  record(input: unknown): Record<string, unknown>
  /** Promote a term with user authority. Reachable only from an approved tool call. */
  confirmTerm(input: { term: string, definition?: string, aliases?: string[], scope?: string }): Record<string, unknown>
  snapshot(): Record<string, unknown>
  hydrate(value: unknown): boolean
  state(): ReturnType<typeof createProjectState>
  plan(): readonly string[]
  isRecorded(): boolean
  status(): { oriented: boolean, missing: string[] }
}

/**
 * Create the orientation store.
 */
export function createOrientationStore(): OrientationStore {
  let state = createProjectState()
  let plan: readonly string[] = []
  let recorded = false

  /**
   * Validate and commit one orientation declaration.
   */
  function record(input: unknown): Record<string, unknown> {
    if (typeof input !== 'object' || input === null) {
      throw new OrientationError('the orientation payload must be an object')
    }
    const payload = input as Record<string, unknown>

    const intent = requireText(payload.intent, 'intent')
    const objective = requireText(payload.objective, 'objective')
    const scope = requireText(payload.scope, 'scope')

    let terminology: Array<{
      term: string
      definition: string
      aliases: string[]
      scope: string
      confidence: number
    }> = []
    if (payload.terminology !== undefined) {
      if (!Array.isArray(payload.terminology)) throw new OrientationError('"terminology" must be an array')
      terminology = payload.terminology.map((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
          throw new OrientationError(`"terminology[${index}]" must be an object`)
        }
        const term = entry as Record<string, unknown>
        const aliases = term.aliases === undefined
          ? []
          : (Array.isArray(term.aliases) ? term.aliases.map((alias, at) => requireText(alias, `terminology[${index}].aliases[${at}]`)) : (() => { throw new OrientationError(`"terminology[${index}].aliases" must be an array`) })())
        return {
          term: requireText(term.term, `terminology[${index}].term`),
          definition: requireText(term.definition, `terminology[${index}].definition`),
          aliases,
          scope: typeof term.scope === 'string' ? term.scope : '',
          confidence: typeof term.confidence === 'number' && term.confidence >= 0 && term.confidence <= 1 ? term.confidence : 0.5,
        }
      })
    }

    let steps: string[] = []
    if (payload.plan !== undefined) {
      if (!Array.isArray(payload.plan)) throw new OrientationError('"plan" must be an array of strings')
      steps = payload.plan.map((step, index) => requireText(step, `plan[${index}]`))
    }

    let next = createProjectState()
    next = applyProjectEvent(next, { type: 'set-intent', value: intent })
    next = applyProjectEvent(next, { type: 'set-objective', value: objective })
    next = applyProjectEvent(next, { type: 'set-scope', value: scope })
    for (const entry of terminology) {
      // Orientation capture is **inference**, always (R8-01). It enters the glossary
      // as PROVISIONAL and can never revise a confirmed entry. Confirmation has its
      // own path: a tool call the host has already approved.
      next = applyProjectEvent(next, { type: 'glossary-define', term: entry.term, definition: entry.definition, aliases: entry.aliases, scope: entry.scope, confidence: entry.confidence, source: 'agent-inferred' })
    }
    for (const step of steps) next = applyProjectEvent(next, { type: 'add-plan-step', value: step })
    next = applyProjectEvent(next, { type: 'set-phase', value: 'executing' })

    state = next
    plan = Object.freeze(steps)
    recorded = true

    const status = orientationStatus(state)
    return {
      recorded: true,
      oriented: status.oriented,
      intent: state.intent,
      objective: state.objective,
      scope: state.scope,
      terminology: state.terminology,
      glossary: serialiseGlossary(state.glossary),
      plan: [...plan],
      note: 'Orientation recorded. Persistent workspace changes are now permitted for this session.',
    }
  }

  /**
   * A serialisable snapshot of the orientation, for durable storage.
   */
  function snapshot(): Record<string, unknown> {
    return {
      state: {
        intent: state.intent,
        objective: state.objective,
        scope: state.scope,
        terminology: { ...state.terminology },
        constraints: [...state.constraints],
        assumptions: [...state.assumptions],
        unknowns: [...state.unknowns],
        plan: [...state.plan],
        currentPhase: state.currentPhase,
      },
      plan: [...plan],
    }
  }

  /**
   * Restore orientation from a durable snapshot. Used when a session is resumed,
   * forked, or restarted, so the requirement is not re-imposed on work that was
   * already oriented. Malformed snapshots are ignored rather than partially
   * applied.
   *
   * @returns whether a usable snapshot was restored.
   */
  function hydrate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false
    const restored = (value as { state?: unknown }).state
    if (typeof restored !== 'object' || restored === null) return false
    const record = restored as Record<string, unknown>
    const intent = typeof record.intent === 'string' ? record.intent : ''
    const objective = typeof record.objective === 'string' ? record.objective : ''
    const scope = typeof record.scope === 'string' ? record.scope : ''
    if (intent === '' || objective === '' || scope === '') return false

    let next = createProjectState()
    next = applyProjectEvent(next, { type: 'set-intent', value: intent })
    next = applyProjectEvent(next, { type: 'set-objective', value: objective })
    next = applyProjectEvent(next, { type: 'set-scope', value: scope })
    if (record.terminology !== null && typeof record.terminology === 'object') {
      for (const [term, definition] of Object.entries(record.terminology)) {
        if (typeof definition === 'string') next = applyProjectEvent(next, { type: 'define-term', term, definition })
      }
    }
    const restoredPlan: unknown[] = Array.isArray(record.plan) ? record.plan : []
    for (const step of restoredPlan) {
      if (typeof step === 'string') next = applyProjectEvent(next, { type: 'add-plan-step', value: step })
    }
    next = applyProjectEvent(next, { type: 'set-phase', value: 'executing' })

    state = next
    plan = Object.freeze(
      restoredPlan.filter((step): step is string => typeof step === 'string'),
    )
    recorded = true
    return true
  }

  /**
   * Promote a term with user authority — the only path to `CONFIRMED`.
   *
   * The model cannot reach this directly: the caller (the host entry point) exposes it
   * exclusively through {@link CONFIRM_TOOL_NAME}, whose every invocation is routed
   * through the host's approval service first. That is the R8-01 boundary — the agent
   * requests, the user decides, the host enforces.
   */
  function confirmTerm(input: { term: string, definition?: string, aliases?: string[], scope?: string }): Record<string, unknown> {
    const term = requireText(input.term, 'term')
    if (input.definition !== undefined) requireText(input.definition, 'definition')
    const aliases = (input.aliases ?? []).map((alias, at) => requireText(alias, `aliases[${at}]`))
    state = applyProjectEvent(state, {
      type: 'glossary-confirm',
      term,
      ...(input.definition === undefined ? {} : { definition: input.definition }),
      aliases,
      ...(input.scope === undefined ? {} : { scope: input.scope }),
      source: 'user',
    })
    const entry = state.glossary.entries.find((candidate) => candidate.canonicalTerm === term)
    return {
      confirmed: entry !== undefined,
      status: entry?.status ?? 'UNKNOWN',
      confirmedByUser: entry?.confirmedByUser ?? false,
      source: entry?.source ?? '',
      glossary: serialiseGlossary(state.glossary),
    }
  }

  return {
    record,
    confirmTerm,
    snapshot,
    hydrate,
    state: () => state,
    plan: () => plan,
    isRecorded: () => recorded,
    status: () => orientationStatus(state),
  }
}

/**
 * The model-facing tool definition. Registered through the tool registry, so the
 * agent discovers it exactly like any host tool.
 *
 * The store is resolved **per call** from the execution's live agent, because
 * orientation is per-agent state (ARCHITECTURE-SPEC Part B §25). Resolving at
 * call time rather than capturing one store at registration is what keeps two
 * concurrent agents from sharing a single orientation.
 */
export function orientationToolDefinition(
  getStore: (exec: unknown) => ReturnType<typeof createOrientationStore>,
  options: {
    onRecorded?: (snapshot: Record<string, unknown>, exec: unknown) => Promise<void> | void
  } = {},
): IegToolDefinition {
  return {
    name: ORIENTATION_TOOL_NAME,
    description:
      'Record the project orientation for this session: the intent, objective, scope, the terminology you will use for the project\'s central concepts, and the ordered task flow you intend to follow. Call this before your first persistent workspace change. It is required once per session and is cheap; prefer recording your best-supported reading over stalling.',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'What the project is for, in your own words.' },
        objective: { type: 'string', description: 'What this task must achieve.' },
        scope: { type: 'string', description: 'What is in scope, and explicitly what is out of scope.' },
        terminology: {
          type: 'array',
          description: 'The central concepts and the terms you will use for them.',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string', description: 'The canonical term.' },
              definition: { type: 'string', description: 'What the term means in this project.' },
              aliases: { type: 'array', items: { type: 'string' }, description: 'Known harmless synonyms for the same project meaning.' },
              scope: { type: 'string', description: 'The project area the term belongs to, if it is not project-wide.' },
              confidence: { type: 'number', description: 'How strongly the evidence supports an inferred term, 0 to 1.' },
            },
            required: ['term', 'definition'],
          },
        },
        plan: {
          type: 'array',
          description: 'The ordered task flow: the steps you intend to take, in order.',
          items: { type: 'string' },
        },
      },
      required: ['intent', 'objective', 'scope'],
    },
    output: { schema: { type: 'object' }, render: () => [] },
    execute: async (args, exec) => {
      const store = getStore(exec)
      const result = store.record(args)
      // Persist best-effort: a storage failure must not fail the tool call, or
      // the agent would be unable to satisfy the orientation requirement at all.
      try {
        await options.onRecorded?.(store.snapshot(), exec)
      } catch {
        /* durability is best-effort */
      }
      return result
    },
  }
}

/**
 * Decide whether a call must be refused because orientation is missing.
 *
 * Precedence in the pipeline is: read-only, then a protected path, then this
 * requirement, then the workspace policy. Returning `deny` (rather than `ask`)
 * is deliberate: the requirement is a process step, not a decision the user
 * should be asked to make.
 */
export function orientationRequirement(
  classification: { kind: 'read-only' | 'persistent-mutation', protected: boolean },
  config: { requireBeforeMutation: boolean },
  store: ReturnType<typeof createOrientationStore>,
): { kind: 'deny', reason: string } | null {
  if (!config.requireBeforeMutation) return null
  if (classification.kind !== 'persistent-mutation') return null
  if (classification.protected) return null
  if (store.isRecorded()) return null
  return {
    kind: 'deny',
    reason:
      `ieg: record the project orientation before changing the workspace — call ${ORIENTATION_TOOL_NAME} ` +
      'with the intent, objective, scope, terminology, and ordered task flow',
  }
}

/**
 * The tool definition for {@link CONFIRM_TOOL_NAME} (R8-01).
 *
 * `run` is supplied by the host entry point and is only ever reached after the host has
 * approved the call, which is why the kernel can expose a promotion path at all without
 * giving the model authority.
 */
export function confirmationToolDefinition(
  run: (exec: unknown, input: { term: string, definition?: string, aliases?: string[], scope?: string }) => Record<string, unknown>,
): Omit<IegToolDefinition, 'output'> {
  return {
    name: CONFIRM_TOOL_NAME,
    description:
      'Ask the user to confirm a project term and, on approval, record it as CONFIRMED project terminology. Use it when the user has stated a term and its meaning, or when an inferred term needs to become authoritative. This call always asks the user: their approval is the only authority, so never treat your own reading as consent, and keep the wording you attribute to them faithful.',
    parameters: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'The canonical term to confirm.' },
        definition: { type: 'string', description: 'The meaning the user gave, faithful in substance.' },
        aliases: { type: 'array', items: { type: 'string' }, description: 'Harmless synonyms the user accepted for this meaning.' },
        scope: { type: 'string', description: 'The project area the term belongs to, if it is not project-wide.' },
      },
      required: ['term'],
    },
    execute: async (input: unknown, exec: unknown) =>
      run(exec, (input ?? {}) as { term: string, definition?: string, aliases?: string[], scope?: string }),
  }
}
