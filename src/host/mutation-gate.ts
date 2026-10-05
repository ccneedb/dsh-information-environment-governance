/**
 * IEG host layer — the mutation gate (R8-05).
 *
 * Section 3 of the entry point: the `tools/pre-execute` waterfall that classifies a
 * workspace mutation, applies the protected-path boundary and the orientation
 * requirement, checks information reintroduction, and returns allow/deny/ask. Extracted
 * with its dependencies named on a surface; the host context is passed rather than reached
 * for, and the kernel functions it calls are imported directly.
 */

import { agentIdOf, type GovernanceState } from '../kernel/state.js'
import { resolveConfig } from '../kernel/config.js'
import { USER_AUTHORITY_TOOLS } from './tool-surface.js'
import { classifyMutation, decideMutation } from '../modules/workspace-governance.js'
import { classifyInventory, parseFrontMatter } from '../kernel/maintenance.js'
import { extractDocumentWrite } from '../kernel/overlap.js'
import { checkDocumentOverlap, headingsMateriallyDistinct } from '../kernel/overlap.js'
import { disposeRecord, reintroductionOf } from '../modules/information-integrity.js'
import { orientationRequirement } from '../kernel/orientation.js'

/** What the mutation gate needs from the composition. */
export interface MutationGateSurface {
  /** Record one diagnostic. */
  note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void
  /** Mount one capability, recording a degradation instead of failing the mount. */
  guarded: (capability: string, attach: () => void) => void
  /** Live per-agent governance state. */
  governance: GovernanceState
  /** The effective workspace policy, exactly as configured. */
  workspace: ReturnType<typeof resolveConfig>['workspace']
  /** The pre-step configuration the gate consults, exactly as configured. */
  preStep: ReturnType<typeof resolveConfig>['preStep']
  /** The host context, for filesystem access and event registration. */
  ctx: IegContext
  /** Restore an agent's orientation from durable storage before evaluating the gate. */
  hydrateOrientation: (agent: unknown) => Promise<boolean>
}

/** Register the mutation gate. */
export function registerMutationGate(surface: MutationGateSurface): void {
  const onPreExecute = async (exec: IegToolExecution, next: () => Promise<IegPreToolDecision>): Promise<IegPreToolDecision> => {
    // Every decision below is taken against the calling agent's own state.
    const agent = exec?.agent
    const { orientation } = surface.governance.forAgent(agent)

    // R8-01: confirming project terminology is a *user-authority* operation, not a
    // workspace mutation, so it is routed through the host's approval service
    // unconditionally — independent of `workspace.policy`, which a deployment may set
    // to `allow`. The tool body that promotes the entry therefore runs only after the
    // user approves, and a missing approval channel degrades the call to a denial.
    // The model can request confirmation; it cannot manufacture it.
    if (USER_AUTHORITY_TOOLS.includes(exec.name)) {
      surface.note(
        'ieg.terminology_confirmation_requested',
        { tool: exec.name, agentId: agentIdOf(agent) },
        `ieg: user_authority_requested tool=${exec.name}`,
      )
      return { kind: 'ask', reason: `${exec.name} confers user authority and requires your explicit approval.` }
    }

    const classification = classifyMutation(exec.name, exec.arguments, surface.workspace)
    if (classification.kind === 'read-only') {
      return next()
    }

    // Gate F: a resumed, forked, or restarted session must not be asked to
    // re-establish orientation it has already declared. One lookup per session,
    // restored into this agent's own store.
    await surface.hydrateOrientation(agent)

    // R8-02 §3: reintroduction detection in the real flow. When a persistent write
    // proposes content matching a disposed or non-authoritative record, the runtime says
    // so. It reports rather than silently repairing, and it does not claim the stale
    // value was rewritten — the host freezes tool results, so IEG has no channel to
    // inject a warning into a later read.
    const proposedDocument = extractDocumentWrite(exec)
    if (proposedDocument !== null) {
      const reintroduced = reintroductionOf(surface.governance.forAgent(agent).information, proposedDocument.content)
      if (reintroduced !== null) {
        surface.note(
          'ieg.information_reintroduced',
          {
            tool: exec.name,
            target: proposedDocument.path,
            record: reintroduced.id,
            recordStatus: reintroduced.status,
            disposition: reintroduced.disposition,
            agentId: agentIdOf(agent),
          },
          `ieg: information_reintroduced id=${reintroduced.id} status=${reintroduced.status} target=${proposedDocument.path}`,
        )
      }
    }

    // Precedence: a protected path is refused outright, then the orientation
    // requirement, then the configured workspace policy. The requirement is a
    // process step, so it denies rather than asking the user.
    if (classification.protected) {
      const protectedDecision = decideMutation(classification, surface.workspace)
      surface.note(
        'ieg.workspace_mutation_blocked',
        { tool: exec.name, reason: 'protected', agentId: agentIdOf(agent) },
        `ieg: workspace_mutation_blocked tool=${exec.name} reason=protected`,
      )
      return protectedDecision
    }

    const orientationDecision = orientationRequirement(classification, surface.preStep, orientation)
    if (orientationDecision !== null) {
      surface.note(
        'ieg.orientation_required',
        { tool: exec.name, agentId: agentIdOf(agent) },
        `ieg: orientation_required tool=${exec.name}`,
      )
      return orientationDecision
    }

    // OBJ-2: refuse to let a new document duplicate an existing one. This runs
    // before the workspace policy so its more specific reason wins, and it
    // fails open — a heuristic must never break a call.
    // `surface.ctx.get` is used deliberately: a direct `surface.ctx.fs` accessor throws when the
    // filesystem service is absent, whereas `get` returns undefined and lets the
    // check degrade to "no overlap".
    const fsService = surface.ctx.get?.('fs') as IegFileSystemService | undefined
    const overlapDecision = await checkDocumentOverlap({
      fs: fsService,
      execution: exec,
      mode: surface.workspace.overlapCheck,      // Batch 6 §4: the gate judges functional role and whether the information
      // is materially distinct, not lexical similarity alone.
      roleOf: (path, content) => classifyInventory(path, parseFrontMatter(content)).inventory,
      distinct: headingsMateriallyDistinct,

    })
    if (overlapDecision !== null) {
      const outcome = overlapDecision.kind === 'deny' ? 'blocked' : 'gated'
      surface.note(
        'ieg.document_overlap_flagged',
        { tool: exec.name, outcome, agentId: agentIdOf(agent) },
        `ieg: document_overlap_${outcome} tool=${exec.name}`,
      )
      return overlapDecision
    }

    const decision = decideMutation(classification, surface.workspace)
    if (decision.kind === 'allow') {
      surface.note('ieg.workspace_mutation_allowed', {
        tool: exec.name,
        targets: classification.targets,
        agentId: agentIdOf(agent),
      })
      return next()
    }

    const outcome = decision.kind === 'deny' ? 'blocked' : 'gated'
    surface.note(
      'ieg.workspace_mutation_blocked',
      { tool: exec.name, outcome, targets: classification.targets, agentId: agentIdOf(agent) },
      `ieg: workspace_mutation_${outcome} tool=${exec.name} targets=${classification.targets.join(',') || '-'}`,
    )
    return decision
  }
  surface.guarded('tools/pre-execute', () => {
    surface.ctx.on('tools/pre-execute', onPreExecute)
  })
}
