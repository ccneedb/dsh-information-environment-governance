/**
 * Information Environment Governance (IEG) — Cordis plugin entry.
 *
 * Contributes exactly **one** additive system-prompt section and binds
 * deterministic enforcement to verified host seams (`ARCHITECTURE-SPEC` §17):
 *
 * ```text
 * system prompt     -> ctx.systemPrompt.section()      (advisory)
 * step admission    -> agent/pre-step                  (veto: reject)
 * mutation gate     -> tools/pre-execute               (gate: ask / deny)
 * mutation backstop -> ctx.tools.guard()               (monotonic deny)
 * ```
 *
 * The plugin has **zero runtime imports** from first-party packages: everything
 * it needs arrives through the injected Cordis context. That keeps it mountable
 * in any composition and immune to the profile's module-resolution layout.
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { resolveConfig, DEFAULT_SECTION_ORDER } from './kernel/config.js'
import { createRegistry } from './kernel/registry.js'
// `lib/**` is the compiled JavaScript of `src/**/*.ts` (see
// TYPESCRIPT-MIGRATION.md). These modules are migrated; the rest of `lib/`
// is still hand-written JavaScript.
import { compilePrompt, promptStats } from './kernel/prompt-compiler.js'
import { createDiagnosticsExporter } from './kernel/export.js'
import { readPromptFile, resolveEffectivePrompt, resolvePromptPath } from './kernel/prompt-store.js'
import { projectGovernanceModule, createProjectState, evaluateOrientationGate } from './modules/project-governance.js'
import { informationIntegrityModule } from './modules/information-integrity.js'
import {
  workspaceGovernanceModule,
  classifyMutation,
  decideMutation,
  guardBackstop,
} from './modules/workspace-governance.js'
import {
  ORIENTATION_TOOL_NAME,
  orientationRequirement,
  orientationToolDefinition,
} from './kernel/orientation.js'
import {
  DEFAULT_TREE_DEPTH,
  checkDocumentOverlap,
  headingsMateriallyDistinct,
  headingsOf,
  jaccard,
  scanDocumentTree,
  tokensOf,
} from './kernel/overlap.js'
import {
  MAINTENANCE_BATCH_THRESHOLD,
  classifyArtifact,
  classifyInventory,
  formatMaintenanceReport,
  formatReconciliation,
  maintenanceKernel,
  parseFrontMatter,
  reconcileChange,
  runMaintenanceRound,
} from './kernel/maintenance.js'
import { completeMaintenanceRound, countInstructionBatch } from './kernel/state.js'
import { createDiagnostics } from './kernel/diagnostics.js'
import { createCompatibilityAdapter, DEFAULT_BASELINE } from './kernel/compatibility.js'
import { createGovernanceState, agentIdOf } from './kernel/state.js'
import { createDurableStore, sessionIdOf } from './kernel/durability.js'

/** Options for {@link buildGovernance}. */
interface BuildGovernanceOptions {
  overrideText?: string
  promptFileText?: string
  promptFilePath?: string
}

/** Result of reading the config-supplied replacement prompt file. */
interface PromptOverrideRead {
  text?: string
  issue?: string
}

/** The compatibility verdict as the mount record carries it. */
interface MountCompatibility {
  verdict: string
  reasons: string[]
  /** Present once the adapter has observed a material assembly. */
  sectionNames?: string[]
  iegIndex?: number
  hostPromptHash?: string | null
  assemblyCount?: number
  observedAt?: string | null
}

/** Mount facts reported by the status tool and the status line. */
interface IegMountRecord {
  mounted: boolean
  degraded: string[]
  promptVersion: string
  promptOverridden: boolean
  promptIssues: string[]
  compiledPromptBytes: number
  sectionName: string
  sectionOrder: number
  promptBytes: number
  modules: string[]
  moduleCount: number
  compatibility: MountCompatibility
}

/** The live prompt facts: the text the section emits, and its provenance. */
interface PromptState {
  text: string
  bytes: number
  overridden: boolean
  /** Where the text came from: `prompt-file` | `config-file` | `config-append` | `compiled`. */
  source: string
  version: string
  issues: string[]
  unchecked: string[]
}

/**
 * Project one read-only tool's canonical JSON value to model content.
 *
 * `ieg_status` is the surface an operator or agent reads to learn what the
 * governance layer is doing. Its canonical value is already lossless JSON, but
 * a tool result only reaches the model through `render`, and returning no
 * content there made the tool silently useless: the call succeeded and the
 * model saw nothing. Rendering the value fixes that.
 *
 * @param {unknown} _args
 * @param {unknown} value
 * @returns {Array<{ type: 'text', text: string }>}
 */
function renderJson(_args: unknown, value: unknown): Array<{ type: 'text', text: string }> {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

/** Cordis plugin name. */
export const name = 'ieg'

/**
 * IEG's core contribution is the prompt section, so it mounts where the prompt
 * registry exists. Tool seams attach defensively, so a composition
 * without them still gets policy and orientation behaviour.
 */
export const inject = ['systemPrompt']

/** The single IEG section name. Occupies no host-reserved name. */
export const SECTION_NAME = 'ieg:governance'

/** The runtime-context channel that carries the governance status line. */
export const STATUS_CONTEXT_NAME = 'ieg:status'

/** The read-only tool that reports governance state to the model and operator. */
export const STATUS_TOOL_NAME = 'ieg_status'

/**
 * The manual maintenance trigger (Batch 6 §3).
 *
 * It is a *report*, not a mutation: the round classifies, diagnoses and proposes,
 * and every destructive proposal waits for an explicit decision. That is why it
 * needs no mutation gate — an unknown tool is read-only by construction.
 */
export const MAINTENANCE_TOOL_NAME = 'maintain_environment'

/**
 * Version of the compiled governance prompt. It changes whenever the injected
 * model-facing text changes, so a behavioural regression is attributable to one
 * prompt revision (ARCHITECTURE-SPEC Part B §22.3, PRODUCT-SPEC PR-07).
 */
export const PROMPT_VERSION = '0.5.0'

/**
 * Version of the plugin package, kept in step with `package.json` `version`.
 * Declared here so the `ieg` CLI can name the build without reading the
 * filesystem at runtime.
 */
export const PLUGIN_VERSION = '0.11.0'

/**
 * Stable kernel invariants: the statements that hold regardless of which modules
 * are enabled. Compiled ahead of module principles.
 *
 * Content rule (handoff §11, "distinguish policy from implementation"): every
 * statement here must be addressable to the *agent*. PRODUCT-SPEC P7 ("prefer
 * deterministic enforcement over repeated prompting") is deliberately **not**
 * included — it governs how this plugin is built, not a behaviour the model can
 * adopt, and emitting it would leak implementation detail into the prompt.
 */
export const KERNEL_PRINCIPLES = Object.freeze([
  'Prefer a safe refusal over an action the user has not authorized.',
  'Unresolved uncertainty may persist unless proceeding would be unsafe.',
  'Diagnose before acting destructively, and report the blocking condition in project terms rather than implementation detail.',
])

/**
 * The three failure classes of PRODUCT-SPEC §2. Success criterion #2 requires
 * each to be represented; every class must be claimed by at least one enabled
 * module, which the prompt-conformance test enforces. `FC-2.4` (fragmented user
 * questioning) and its module were withdrawn in 0.7.0 with the user-attention
 * capability.
 */
export const FAILURE_CLASSES = Object.freeze([
  'FC-2.1', // project ownership and semantic drift
  'FC-2.2', // unauthorized workspace mutation
  'FC-2.3', // reuse of known-invalid information
])

/** The three shipped modules, in registration order. */
export const MODULES = Object.freeze([
  projectGovernanceModule,
  informationIntegrityModule,
  workspaceGovernanceModule,
])

/**
 * Build the governance kernel: validated config, registered modules, and the
 * compiled prompt section. Pure — no Cordis context required — so it is directly
 * unit-testable.
 *
 * Precedence is the prompt store's, not this function's: an operator
 * `prompt.md` read by the caller (`promptFileText`) outranks the config layer, which
 * outranks the compiled default. The caller does the I/O; this stays pure.
 *
 * @param raw
 * @param options
 */
export function buildGovernance(raw?: unknown, options: BuildGovernanceOptions = {}) {
  const config = resolveConfig(raw)
  const registry = createRegistry()
  for (const module of MODULES) registry.registerModule(module)
  registry.configure(config.modules)

  const enabled = registry.getEnabledModules()
  const basePrompt = config.enabled ? compilePrompt({ kernelPrinciples: KERNEL_PRINCIPLES, modules: enabled }) : ''
  const effective = config.enabled
    ? resolveEffectivePrompt({
        mode: config.prompt.mode,
        append: config.prompt.append,
        configText: options.overrideText,
        promptFileText: options.promptFileText,
        promptFilePath: options.promptFilePath,
        basePrompt,
        allowOverBudget: config.prompt.allowOverBudget,
      })
    : {
        text: '',
        applied: false,
        source: 'compiled',
        versionSuffix: '',
        issues: [],
        unchecked: [],
        bytes: 0,
        promptFilePath: '',
        promptFileRefused: false,
      }

  return {
    config,
    registry,
    enabled,
    prompt: effective.text,
    stats: promptStats(effective.text),
    /** Why a user prompt edit was refused or ignored; surfaced as diagnostics on mount. */
    promptIssues: effective.issues,
    promptOverridden: effective.applied,
    /** `prompt-file` | `config-file` | `config-append` | `compiled`. */
    promptSource: effective.source,
    /** Soft invariants that no longer apply once the text is user-authored. */
    promptUnchecked: effective.unchecked,
    /** `PROMPT_VERSION`, suffixed when a user edit is in force, so one text is one version. */
    promptVersion: `${PROMPT_VERSION}${effective.versionSuffix}`,
    /** Bytes of the audited compiled default, for a diff in any front end. */
    compiledBytes: promptStats(basePrompt).bytes,
    /** The audited compiled text, which every override is validated against. */
    compiledPrompt: basePrompt,
  }
}

/**
 * Mount the observable surface of IEG when the kernel cannot be built.
 *
 * `ARCHITECTURE-SPEC` §26.2: `apply()` must not throw, because the host reports a
 * throwing entry as `warning: N entry did not activate` and continues without the
 * plugin. A governance layer that fails to mount must at least be **visible**, so
 * this path registers no prompt section and no enforcement, and exposes the fault
 * through the read-only status surface instead. Fail-safe, and observable: an
 * operator reading only the transcript can tell that IEG is inert and why.
 */
function mountConfigFaultSurface(ctx: IegContext, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  try {
    const diagnostics = createDiagnostics({ limit: 200 })
    diagnostics.record({ code: 'ieg.config_invalid', data: { message } })
    /** Seams that are absent even for the fault surface itself. */
    const degraded: string[] = []
    const mount = {
      mounted: false,
      degraded,
      configError: message,
      promptVersion: PROMPT_VERSION,
      sectionName: SECTION_NAME,
      sectionOrder: DEFAULT_SECTION_ORDER,
      modules: [],
      moduleCount: 0,
      compatibility: { verdict: 'PENDING', reasons: [] },
    }

    if (ctx.systemPrompt === undefined) {
      degraded.push('systemPrompt')
    } else {
      try {
        ctx.systemPrompt.context?.({
          name: STATUS_CONTEXT_NAME,
          order: DEFAULT_SECTION_ORDER,
          text: () => diagnostics.formatLine(),
        })
      } catch {
        // The tool and the log line below still carry the fault.
      }
    }

    if (ctx.inject === undefined) {
      degraded.push('tools')
    } else {
      ctx.inject(['tools'], (toolCtx) => {
        try {
          toolCtx.tools?.register({
            name: STATUS_TOOL_NAME,
            description:
              'Read IEG governance state. Read-only. A mount record with "mounted: false" and a configError means the governance layer is inert: no IEG prompt section and no IEG enforcement is active.',
            parameters: { type: 'object', properties: {} },
            output: { schema: { type: 'object' }, render: renderJson },
            execute: async () => ({
              mount,
              status_line: diagnostics.formatLine(),
              diagnostics: diagnostics.recent(20),
            }),
          })
        } catch {
          // A registry that refuses the tool must not resurrect the mount fault.
        }
      })
    }

    try {
      ctx.logger?.warn(`ieg: config_invalid ${message}`)
    } catch {
      // Log narration is best effort by design (§28.3 channel D).
    }
  } catch {
    // Even the diagnostic surface is best effort: `apply()` must never throw.
  }
}

/**
 * Read the replacement prompt file named by the raw configuration.
 *
 * Deliberately here, in the host-touching layer, rather than in the pure kernel:
 * `buildGovernance()` stays free of I/O and unit-testable without a filesystem.
 * An unreadable file is not fatal — the audited compiled default is used and the
 * reason is reported as a diagnostic.
 */
function readPromptOverride(rawConfig: unknown): PromptOverrideRead {
  if (typeof rawConfig !== 'object' || rawConfig === null || Array.isArray(rawConfig)) return {}
  const prompt = (rawConfig as { prompt?: unknown }).prompt
  if (typeof prompt !== 'object' || prompt === null || Array.isArray(prompt)) return {}
  const { mode, file } = prompt as { mode?: unknown, file?: unknown }
  if (mode !== 'replace' || typeof file !== 'string' || file.trim() === '') return {}
  try {
    return { text: readFileSync(file, 'utf8') }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { issue: `prompt.file could not be read (${message}); the compiled default is in use` }
  }
}

/**
 * Mount IEG.
 *
 * Contract (`ARCHITECTURE-SPEC` §26.2): **this function does not throw.**
 * Configuration faults degrade to a diagnostic, and each capability is
 * registered inside its own guarded step, so one failing seam cannot cost the
 * deployment the rest of the governance layer.
 *
 * The operator's `prompt.md` is the prompt layer's own input: it is read here
 * and resolved by the prompt store, so the mounted configuration and the prompt
 * text stay independent of each other.
 */
export function apply(ctx: IegContext, rawConfig?: unknown): void {
  let kernel: ReturnType<typeof buildGovernance>
  let overrideIssue = ''
  let promptFileIssue = ''
  const promptFilePath = resolvePromptPath({ env: process.env })
  try {
    const override = readPromptOverride(rawConfig)
    if (override.issue !== undefined) overrideIssue = override.issue
    const promptFile = readPromptFile(promptFilePath)
    if (promptFile.issue !== undefined) promptFileIssue = promptFile.issue
    kernel = buildGovernance(rawConfig, {
      overrideText: override.text,
      promptFileText: promptFile.text,
      promptFilePath,
    })
  } catch (error) {
    mountConfigFaultSurface(ctx, error)
    return
  }

  const { config, registry, enabled, prompt, stats } = kernel

  if (!config.enabled) {
    try {
      ctx.logger?.info('ieg: governance disabled by configuration')
    } catch {
      // Best-effort narration only.
    }
    return
  }

  // Governance state is per live agent, keyed by the agent object itself
  // (ARCHITECTURE-SPEC §17.7, Part B §25). One composition therefore serves many
  // agents without letting them observe each other's orientation.
  const governance = createGovernanceState()

  /* ── observability (Part B §28) ───────────────────────────────────────── */

  // The ring always records: it is bounded, in-memory, and cheap, and the
  // read-only status surface must work even when log narration is switched off.
  // `config.diagnostics` gates only the `ctx.logger` narration, because that is
  // the channel that is invisible in stock compositions anyway (§28.1).
  const diagnostics = createDiagnostics({ limit: 200 })

  /**
   * Capabilities whose registration failed or whose seam was absent. Empty means
   * a complete mount. `mounted: true` alone cannot distinguish a full mount from a
   * partial one, so this is what an external health check must key on (§26.1).
   */
  const degradedCapabilities: string[] = []

  /** Mount facts reported by the status tool and the status line. */
  const mount: IegMountRecord = {
    mounted: true,
    degraded: degradedCapabilities,
    promptVersion: kernel.promptVersion,
    promptOverridden: kernel.promptOverridden,
    promptIssues: kernel.promptIssues,
    compiledPromptBytes: kernel.compiledBytes,
    sectionName: SECTION_NAME,
    sectionOrder: config.sectionOrder,
    promptBytes: stats.bytes,
    modules: enabled.map((module) => module.id),
    moduleCount: enabled.length,
    /** Replaced by the compatibility adapter's snapshot once it observes one. */
    compatibility: { verdict: 'PENDING', reasons: [] },
  }

  /**
   * The live prompt facts, as resolved at mount. `dsh-ieg prompt edit` changes
   * the on-disk `prompt.md`; {@link livePromptText} re-resolves it on each
   * assembly so an edit applies without a remount, and the read-only `ieg_status`
   * tool reports these mount-time facts.
   */
  const promptState: PromptState = {
    text: prompt,
    bytes: stats.bytes,
    overridden: kernel.promptOverridden,
    source: kernel.promptSource,
    version: kernel.promptVersion,
    issues: [...kernel.promptIssues],
    unchecked: [...kernel.promptUnchecked],
  }

  /**
   * Re-resolve the prompt facts from disk.
   *
   * An edit to `prompt.md` must apply to the next assembly, and nothing else
   * re-reads it now that the 0.6.0 control plane is gone (Batch 5 removed it).
   * The section text and the read-only `ieg_status` report both read this, so the
   * reported source can never disagree with the text actually emitted. A file
   * that vanished, or a refused candidate, falls back to the mount-time facts, so
   * this never throws and never emits unvalidated text.
   */
  const livePromptFacts = (): PromptState => {
    const read = readPromptFile(promptFilePath)
    if (read.text === undefined) return promptState
    try {
      const next = buildGovernance(rawConfig, { promptFileText: read.text, promptFilePath })
      return {
        text: next.prompt,
        bytes: next.stats.bytes,
        overridden: next.promptOverridden,
        source: next.promptSource,
        version: next.promptVersion,
        issues: [...next.promptIssues],
        unchecked: [...next.promptUnchecked],
      }
    } catch {
      return promptState
    }
  }

  /** Set once the exporter exists; `note()` calls it so every record can mirror. */
  let flushExport: () => void = () => {}

  /**
   * Record one diagnostic and, when narration is enabled, keep the historical
   * `ctx.logger` line byte-for-byte so existing behaviour and tests are stable.
   *
   * @param code
   * @param data
   * @param narration
   * @param level
   */
  const note = (code: string, data?: Record<string, unknown>, narration?: string, level: 'info' | 'warn' = 'info'): void => {
    diagnostics.record({ code, data })
    flushExport()
    if (!config.diagnostics || narration === undefined) return
    // Log narration is best effort (§28.3 channel D): a deployment with a broken
    // or absent logger must still get the ring, the status line, and the tools.
    try {
      if (level === 'warn') ctx.logger?.warn(narration)
      else ctx.logger?.info(narration)
    } catch {
      // Deliberately swallowed: narration must never affect enforcement.
    }
  }

  /**
   * Register one capability, degrading a failure to a diagnostic.
   *
   * `ARCHITECTURE-SPEC` §26.2 requires `apply()` not to throw: the host reports a
   * throwing entry as `warning: N entry did not activate` and continues without
   * IEG. Isolating each registration means one unavailable seam costs only that
   * seam, and the fault is recorded where the status surface can report it.
   *
   * @param capability
   * @param action
   */
  const guarded = (capability: string, action: () => void): void => {
    try {
      action()
    } catch (error) {
      degradedCapabilities.push(capability)
      const message = error instanceof Error ? error.message : String(error)
      note('ieg.error', { capability, message }, `ieg: ${capability} failed: ${message}`, 'warn')
    }
  }

  /**
   * Record a seam that is absent, which is not the same as a seam IEG does not
   * need: without this, a vanished host service is indistinguishable from a
   * capability that was never required.
   *
   * @param capability
   */
  const noteMissing = (capability: string): void => {
    degradedCapabilities.push(capability)
    note('ieg.capability_missing', { capability }, `ieg: capability_missing ${capability}`, 'warn')
  }

  /* ── user-editable prompt (§27.1) ─────────────────────────────────────── */

  // A refused or ignored user edit is a governance event, not a silent fallback:
  // the deployment must be able to see that its text is not in force.
  for (const issue of kernel.promptIssues) {
    note('ieg.prompt_override_rejected', { issue }, `ieg: prompt_override_rejected ${issue}`, 'warn')
  }
  if (overrideIssue !== '') {
    note('ieg.prompt_override_missing', { issue: overrideIssue }, `ieg: prompt_override_missing ${overrideIssue}`, 'warn')
  }
  if (kernel.promptOverridden) {
    note(
      'ieg.prompt_override_applied',
      { promptVersion: kernel.promptVersion, bytes: stats.bytes, unchecked: kernel.promptUnchecked },
      `ieg: prompt_override_applied version=${kernel.promptVersion} bytes=${stats.bytes} ` +
        `unchecked=${kernel.promptUnchecked.length}`,
      'warn',
    )
  }

  /* ── opt-in diagnostics mirror (§28.7) ────────────────────────────────── */

  // A front end cannot read the in-process ring; this mirrors it to a path the
  // deployment chooses, at most once per interval, and only when asked for.
  const exporter = createDiagnosticsExporter({
    file: config.diagnosticsExport.file,
    limit: config.diagnosticsExport.limit,
    snapshot: () => ({
      mount,
      status_line: diagnostics.formatLine(),
      counts: diagnostics.counts(),
      diagnostics: diagnostics.recent(config.diagnosticsExport.limit),
    }),
    writeFile:
      config.diagnosticsExport.file === ''
        ? undefined
        : (path: string, text: string) => {
            mkdirSync(dirname(path), { recursive: true })
            const temporary = `${path}.tmp`
            writeFileSync(temporary, text)
            renameSync(temporary, path)
          },
    onError: (message) =>
      note('ieg.diagnostics_export_failed', { message }, `ieg: diagnostics_export_failed ${message}`, 'warn'),
  })
  if (exporter.file !== '') {
    flushExport = () => {
      exporter.flush()
    }
    guarded('diagnosticsExport', () => {
      exporter.flush(true)
    })
  guarded('dispose.diagnosticsExport', () => {
      ctx.effect?.(() => () => {
        exporter.close()
      }, 'ieg: stop mirroring diagnostics')
    })
  }

  /* ── compatibility adapter (Part B §29) ───────────────────────────────── */

  // Observes the host's own assembly on the `system-prompt/assemble` waterfall.
  // The listener always calls `next()`: IEG never blocks or replaces an
  // assembly, so a host drift is reported, never enforced (fail open).
  const compatibility = createCompatibilityAdapter({
    baseline: DEFAULT_BASELINE,
    capabilities: () =>
      ['systemPrompt', 'tools', 'fs', 'storageDomain', 'approval'].filter(
        (name) => ctx.get?.(name) !== undefined,
      ),
    onVerdict: (result, snapshot) => {
      mount.compatibility = snapshot
      note('ieg.host_compatibility', { verdict: result.verdict, reasons: result.reasons })
    },
  })

  guarded('system-prompt/assemble', () => {
    ctx.on('system-prompt/assemble', (assembly: unknown, context: unknown, next: () => unknown) => {
      try {
        compatibility.observe(assembly, context)
      } catch (error) {
        note('ieg.error', { phase: 'compatibility', message: String(((error as { message?: unknown } | null)?.message) ?? error) })
      }
      return next()
    })
  })

  /* ── durable state (handoff Gate F) ───────────────────────────────────── */

  // Storage is optional and every failure degrades to "no persistence"; IEG's
  // enforcement never depends on it. The fallback also covers a storage seam that
  // throws during construction, rather than only one that reports an error.
  let durable: ReturnType<typeof createDurableStore> = {
    available: async () => false,
    load: async () => undefined,
    save: async () => false,
    close: async () => {},
  }
  guarded('storageDomain', () => {
    durable = createDurableStore(ctx, {
      onError: (error) =>
        note(
          'ieg.capability_missing',
          { capability: 'storageDomain' },
          `ieg: governance persistence unavailable: ${String(((error as { message?: unknown } | null)?.message) ?? error)}`,
          'warn',
        ),
    })
  })
  /** Sessions already looked up, so a resumed session costs one read, not one per call. */
  const hydratedSessions = new Set<string>()

  /**
   * Restore one agent's orientation from durable state. Called lazily, before
   * the orientation requirement is evaluated, so a resumed session is not asked
   * to re-orient work that was already oriented (Gate F).
   *
   * @param agent
   * @returns whether a usable snapshot was restored.
   */
  const hydrateOrientation = async (agent: unknown): Promise<boolean> => {
    const { orientation } = governance.forAgent(agent)
    if (orientation.isRecorded()) return true
    const sessionId = sessionIdOf(agent)
    if (sessionId === '' || hydratedSessions.has(sessionId)) return false
    hydratedSessions.add(sessionId)
    const snapshot = await durable.load(sessionId)
    if (snapshot === undefined) return false
    if (!orientation.hydrate(snapshot)) return false
    note('ieg.orientation_restored', { sessionId }, 'ieg: orientation_restored')
    return true
  }

  const persistOrientation = async (snapshot: Record<string, unknown>, exec: unknown): Promise<void> => {
    const agent = ((exec ?? {}) as { agent?: unknown }).agent
    await durable.save(sessionIdOf(agent), snapshot)
  }

  guarded('dispose.storageDomain', () => {
    ctx.effect?.(() => () => {
      void durable.close()
    }, 'ieg: release the governance domain handle')
  })

  /* ── 1. the one additive prompt section ───────────────────────────────── */

  // `interpolate: false` is mandatory: governance text is literal, and the host
  // would otherwise throw on an unknown `{{variable}}` reference. `complete` is
  // deliberately never set (§4).
  if (ctx.systemPrompt === undefined) {
    // `inject` declares this seam as required, so its absence is a host-contract
    // breach that must be visible rather than a silently empty contribution.
    noteMissing('systemPrompt')
  } else {
    guarded('systemPrompt.section', () => {
      ctx.systemPrompt?.section({
        name: SECTION_NAME,
        order: config.sectionOrder,
        interpolate: false,
        // A function-valued provider is re-evaluated per assembly, which is what
        // lets a `prompt.md` edit take effect on the next assembly.
        text: () => livePromptFacts().text,
      })
    })

    // Channel A (§28.3): one bounded status line, registered once. The host
    // re-evaluates a function-valued `text` on every assembly and supersedes the
    // previous snapshot instead of accumulating one, and it renders through the
    // runtime-context channel rather than the compiled prompt — both verified
    // against the real `dsh-system-prompt`, which resolves assumption B2.
    if (config.diagnostics) {
      guarded('systemPrompt.context', () => {
        ctx.systemPrompt?.context?.({
          name: STATUS_CONTEXT_NAME,
          order: config.sectionOrder,
          text: () => diagnostics.formatLine(),
        })
      })
    }
  }

  /* ── 2. pre-step orientation gate ─────────────────────────────────────── */

  const onPreStep = async (payload: IegPreStepPayload, next: () => Promise<IegPreStepDecision>): Promise<IegPreStepDecision> => {
    // The step's own agent decides which orientation is evaluated.
    const agent = payload?.agent
    const { orientation, batches } = governance.forAgent(agent)

    // Batch 6 §6: count direct user instruction batches. The host opens one turn
    // per batch of user messages and repeats that turn for every internal step, so
    // keying on the turn (and requiring a message) excludes steps, tool calls and
    // generated context by construction.
    const counted = countInstructionBatch(batches, { turn: payload?.turn, messages: payload?.messages })
    // The diagnostic *is* the announcement, so it fires on the batch that crosses
    // the threshold and not on every counted batch. The running count is visible in
    // the status line and in `ieg_status` either way.
    if (counted.due) {
      note('ieg.maintenance_due', {
        batches: batches.count,
        threshold: MAINTENANCE_BATCH_THRESHOLD,
        agentId: agentIdOf(agent),
      }, `ieg: maintenance_due batches=${batches.count}/${MAINTENANCE_BATCH_THRESHOLD} — run the maintenance round at the next safe boundary`)
    }
    const { decision, missing } = evaluateOrientationGate(orientation.state(), config.preStep.orientationGate)
    if (decision !== null) {
      note(
        'ieg.orientation_required',
        { phase: 'pre-step', missing, agentId: agentIdOf(agent) },
        `ieg: pre_step_rejected missing=${missing.join(',')} agent=${agentIdOf(agent) || '-'}`,
        'warn',
      )
      return decision
    }
    if (config.preStep.orientationGate === 'warn' && missing.length > 0) {
      note(
        'ieg.orientation_required',
        { phase: 'pre-step', outcome: 'warn', missing },
        `ieg: orientation_incomplete missing=${missing.join(',')}`,
      )
    }
    return next()
  }
  guarded('agent/pre-step', () => {
    ctx.on('agent/pre-step', onPreStep)
  })

  /* ── 3. mutation gate: tools/pre-execute ──────────────────────────────── */

  const onPreExecute = async (exec: IegToolExecution, next: () => Promise<IegPreToolDecision>): Promise<IegPreToolDecision> => {
    // Every decision below is taken against the calling agent's own state.
    const agent = exec?.agent
    const { orientation } = governance.forAgent(agent)

    const classification = classifyMutation(exec.name, exec.arguments, config.workspace)
    if (classification.kind === 'read-only') {
      return next()
    }

    // Gate F: a resumed, forked, or restarted session must not be asked to
    // re-establish orientation it has already declared. One lookup per session,
    // restored into this agent's own store.
    await hydrateOrientation(agent)

    // Precedence: a protected path is refused outright, then the orientation
    // requirement, then the configured workspace policy. The requirement is a
    // process step, so it denies rather than asking the user.
    if (classification.protected) {
      const protectedDecision = decideMutation(classification, config.workspace)
      note(
        'ieg.workspace_mutation_blocked',
        { tool: exec.name, reason: 'protected', agentId: agentIdOf(agent) },
        `ieg: workspace_mutation_blocked tool=${exec.name} reason=protected`,
      )
      return protectedDecision
    }

    const orientationDecision = orientationRequirement(classification, config.preStep, orientation)
    if (orientationDecision !== null) {
      note(
        'ieg.orientation_required',
        { tool: exec.name, agentId: agentIdOf(agent) },
        `ieg: orientation_required tool=${exec.name}`,
      )
      return orientationDecision
    }

    // OBJ-2: refuse to let a new document duplicate an existing one. This runs
    // before the workspace policy so its more specific reason wins, and it
    // fails open — a heuristic must never break a call.
    // `ctx.get` is used deliberately: a direct `ctx.fs` accessor throws when the
    // filesystem service is absent, whereas `get` returns undefined and lets the
    // check degrade to "no overlap".
    const fsService = ctx.get?.('fs') as IegFileSystemService | undefined
    const overlapDecision = await checkDocumentOverlap({
      fs: fsService,
      execution: exec,
      mode: config.workspace.overlapCheck,      // Batch 6 §4: the gate judges functional role and whether the information
      // is materially distinct, not lexical similarity alone.
      roleOf: (path, content) => classifyInventory(path, parseFrontMatter(content)).inventory,
      distinct: headingsMateriallyDistinct,

    })
    if (overlapDecision !== null) {
      const outcome = overlapDecision.kind === 'deny' ? 'blocked' : 'gated'
      note(
        'ieg.document_overlap_flagged',
        { tool: exec.name, outcome, agentId: agentIdOf(agent) },
        `ieg: document_overlap_${outcome} tool=${exec.name}`,
      )
      return overlapDecision
    }

    const decision = decideMutation(classification, config.workspace)
    if (decision.kind === 'allow') {
      note('ieg.workspace_mutation_allowed', {
        tool: exec.name,
        targets: classification.targets,
        agentId: agentIdOf(agent),
      })
      return next()
    }

    const outcome = decision.kind === 'deny' ? 'blocked' : 'gated'
    note(
      'ieg.workspace_mutation_blocked',
      { tool: exec.name, outcome, targets: classification.targets, agentId: agentIdOf(agent) },
      `ieg: workspace_mutation_${outcome} tool=${exec.name} targets=${classification.targets.join(',') || '-'}`,
    )
    return decision
  }
  guarded('tools/pre-execute', () => {
    ctx.on('tools/pre-execute', onPreExecute)
  })

  /* ── 4. tool registry: the orientation tool and the guard backstop ────── */

  // Registered through `ctx.inject` so they attach whenever the tool registry
  // becomes available, without making IEG unmountable in tool-less compositions.
  const attachTools = (toolCtx: IegContext): void => {
    /**
     * Wrap a tool so its calls are auditable without changing its contract.
     *
     * @param definition
     * @param code
     */
    const observed = (definition: IegToolDefinition, code: string): IegToolDefinition => ({
      ...definition,
      execute: async (args, exec) => {
        const result = await definition.execute(args, exec)
        note(code, { tool: definition.name, agentId: agentIdOf(((exec ?? {}) as { agent?: unknown }).agent) })
        return result
      },
    })

    // Each tool is registered in its own guarded step: a registry that refuses
    // one definition must not cost the model the other tool, nor the backstop.
    // The agent's only sanctioned way to satisfy the orientation requirement.
    // Recording it also persists it, so a resumed session skips the requirement.
    guarded('tools.record_orientation', () => {
      toolCtx.tools?.register(
        observed(
          orientationToolDefinition((exec) => governance.forAgent(((exec ?? {}) as { agent?: unknown }).agent).orientation, {
            onRecorded: persistOrientation,
          }),
          'ieg.orientation_recorded',
        ),
      )
    })
    // Channel B (§28.3): the read-only surface an agent or operator can query.
    guarded('tools.ieg_status', () => {
      toolCtx.tools?.register({
        name: STATUS_TOOL_NAME,
        description:
          'Read IEG governance state: mount record, enabled modules, active configuration, host-compatibility verdict, and the recent diagnostic ring. Read-only; call it when you need to know what the governance layer is doing.',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'object' }, render: renderJson },
        execute: async (_args, exec) => ({
          mount,
          prompt: ((): Record<string, unknown> => {
            const live = livePromptFacts()
            return {
              source: live.source,
              file: promptFilePath,
              version: live.version,
              bytes: live.bytes,
            }
          })(),
          compatibility: mount.compatibility,
          agentId: agentIdOf(((exec ?? {}) as { agent?: unknown }).agent),
          status_line: diagnostics.formatLine(),
          maintenance: ((): Record<string, unknown> => {
            const counter = governance.forAgent(((exec ?? {}) as { agent?: unknown }).agent).batches
            return {
              instruction_batches: counter.count,
              threshold: MAINTENANCE_BATCH_THRESHOLD,
              required: counter.required,
              rounds_completed: counter.roundsCompleted,
            }
          })(),
          diagnostics: diagnostics.recent(20),
          diagnostic_counts: diagnostics.counts(),
        }),
      })
    })
    // Channel C (Batch 6 §3): one manually triggerable maintenance round. It is
    // read-only by construction, so it is registered without a mutation gate, and
    // it reports rather than acts: Batch 6 §5 forbids claiming automatic
    // synchronization, and an automatic round could rewrite the user's documents.
    guarded('tools.maintain_environment', () => {
      toolCtx.tools?.register({
        name: MAINTENANCE_TOOL_NAME,
        description:
          'Run one information environment maintenance round over the workspace: inventory persistent artifacts, diagnose duplication, staleness, obsolescence and contradiction, and return proposed actions (KEEP, MERGE, UPDATE, REPLACE, DEPRECATE, REMOVE, LEAVE_UNCHANGED, REQUIRES_REVIEW) each with a reason and a confidence. Read-only: it changes nothing, and every destructive proposal needs an explicit human decision. Use it when the runtime context marks maintenance as due, or when asked to check the information environment.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Root to inventory, relative to the workspace. Defaults to ".".' },
            depth: { type: 'number', description: `Directory depth to scan (default ${DEFAULT_TREE_DEPTH}, hard cap 6).` },
            changed: {
              type: 'string',
              description: 'Optional path of an artifact that just changed. Naming one adds a reconciliation: which other artifacts mention its subject, which of their stated facts have gone stale, and what remains unresolved.',
            },
          },
        },
        output: { schema: { type: 'object' }, render: renderJson },
        execute: async (args, exec) => {
          const fsService = ctx.get?.('fs') as IegFileSystemService | undefined
          const raw = (args ?? {}) as { path?: unknown, depth?: unknown, changed?: unknown }
          const root = typeof raw.path === 'string' && raw.path.trim() !== '' ? raw.path : '.'
          const depth = Math.min(typeof raw.depth === 'number' && Number.isFinite(raw.depth) ? Math.max(0, Math.trunc(raw.depth)) : DEFAULT_TREE_DEPTH, 6)

          if (fsService === undefined) {
            // An unavailable service is a recorded degradation, never a silent
            // "nothing to maintain".
            note('ieg.maintenance_round', { status: 'degraded', reason: 'no filesystem service' }, 'maintenance round degraded: no filesystem service', 'warn')
            return {
              status: 'degraded',
              reason: 'the filesystem service is unavailable, so no artifact could be read',
              unscanned: true,
            }
          }

          const scanned = await scanDocumentTree(fsService, root, { maxDepth: depth })
          const contents: Record<string, string> = {}
          const artifacts = scanned.documents.map((document) => {
            contents[document.path] = document.content
            return classifyArtifact({
              path: document.path,
              content: document.content,
              headings: headingsOf(document.content),
              tokens: [...tokensOf(document.content)],
            })
          })

          const report = runMaintenanceRound({
            artifacts,
            truth: { packageVersion: PLUGIN_VERSION, promptVersion: PROMPT_VERSION },
            contents,
            coverage: (a, b) => jaccard(new Set(a), new Set(b)),
            scanned: scanned.documents.length,
            truncated: scanned.truncated,
            skipped: scanned.skipped,
          })

          // Instruction 5: reconcile one named change against the rest of the
          // environment. This is the only caller of `reconcileChange`, so the
          // capability has a real path rather than being dead code.
          const changed = typeof raw.changed === 'string' && raw.changed.trim() !== '' ? raw.changed.trim() : undefined
          let reconciliation: Record<string, unknown> | undefined
          if (changed !== undefined) {
            const subject = artifacts.find((artifact) => artifact.path === changed)
            reconciliation = subject === undefined
              ? { changed, affected: [], stale: [], contradictions: [], unresolved: [`${changed} is not in the scanned inventory, so nothing could be reconciled`] }
              : (() => {
                const result = reconcileChange({
                  change: { path: subject.path, summary: subject.headings[0] ?? subject.path, tokens: subject.tokens },
                  artifacts,
                  contents,
                  truth: { packageVersion: PLUGIN_VERSION, promptVersion: PROMPT_VERSION },
                  coverage: (a, b) => jaccard(new Set(a), new Set(b)),
                })
                return { ...result, report: formatReconciliation(result) }
              })()
            note('ieg.maintenance_round', {
              phase: 'reconciliation',
              changed,
              affected: (reconciliation.affected as string[] | undefined)?.length ?? 0,
              unresolved: (reconciliation.unresolved as string[] | undefined)?.length ?? 0,
            })
          }

          // A completed round is what resets the seven-batch counter (Batch 6 §6),
          // and the reset is recorded so the accounting is auditable.
          const counter = governance.forAgent(((exec ?? {}) as { agent?: unknown }).agent).batches
          const countedBefore = counter.count
          completeMaintenanceRound(counter)

          note('ieg.maintenance_round', {
            status: 'ok',
            root,
            scanned: report.scanned,
            proposals: report.items.length,
            unresolved: report.unresolved.length,
            batchesResetFrom: countedBefore,
            roundsCompleted: counter.roundsCompleted,
          })

          return {
            status: 'ok',
            root,
            ...(reconciliation === undefined ? {} : { reconciliation }),
            scanned: report.scanned,
            truncated: report.truncated,
            inventory: report.inventoryCounts,
            counts: report.counts,
            items: report.items,
            unresolved: report.unresolved,
            actions: maintenanceKernel.actions,
            report: formatMaintenanceReport(report),
          }
        },
      })
    })
    const guard = (execution: IegToolExecution): string | undefined => guardBackstop(execution, config.workspace)
    guarded('tools.guard', () => {
      toolCtx.tools?.guard(guard)
    })
  }
  if (ctx.inject === undefined) {
    // No injection seam means no capture surfaces at all; that is a degradation
    // to record, not a quiet no-op.
    noteMissing('tools')
  } else {
    guarded('tools', () => {
      ctx.inject?.(['tools'], attachTools)
    })
  }

  /* ── 5. mount record ──────────────────────────────────────────────────── */

  // Emitted as late as possible, so a partially registered plugin is visible as
  // a partially registered plugin (Part B §26.1).
  note(
    'ieg.mount',
    {
      modules: enabled.map((module) => module.id),
      promptVersion: kernel.promptVersion,
      promptOverridden: kernel.promptOverridden,
      promptBytes: stats.bytes,
    },
    `ieg: governance mounted modules=${enabled.map((module) => module.id).join(',')} ` +
      `section=${SECTION_NAME}@${config.sectionOrder} bytes=${stats.bytes} ` +
      `workspace=${config.workspace.policy} gate=${config.preStep.orientationGate}`,
  )
  // The mount records exist only now, and the throttle would otherwise suppress
  // them: flush once, here, so a mirror reader never sees an empty ring.
  guarded('diagnosticsExport.mount', () => {
    exporter.flush(true)
  })

  if (config.diagnostics) {
    // Best effort, like every other narration call: the ring and the status
    // surface already carry this, and a logger fault must not unmount IEG.
    try {
      for (const [key, value] of Object.entries(registry.diagnostics())) {
        if (Array.isArray(value) && value.length > 0) ctx.logger?.info(`ieg: ${key}=${value.join(',')}`)
      }
    } catch {
      // Deliberately swallowed.
    }
  }
}

export {
  resolveConfig,
  createRegistry,
  compilePrompt,
  createProjectState,
  evaluateOrientationGate,
  classifyMutation,
  decideMutation,
  guardBackstop,
}
