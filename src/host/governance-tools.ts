/**
 * IEG host layer — the governance tool registrations (R8-05).
 *
 * The orientation capture, the read-only status surface, the gated terminology
 * confirmation and the mutation backstop, plus the audit wrapper they all use. Each was
 * bound to the entry point's closure; naming the dependencies on a surface is what lets
 * the entry point read as composition rather than one large closure.
 */

import { confirmationToolDefinition, orientationToolDefinition, ORIENTATION_TOOL_NAME } from '../kernel/orientation.js'
import { STATUS_TOOL_NAME, renderJson } from './tool-surface.js'
import { agentIdOf, type GovernanceState } from '../kernel/state.js'
import { guardBackstop } from '../modules/workspace-governance.js'
import { MAINTENANCE_BATCH_THRESHOLD } from '../kernel/maintenance.js'

/** What the governance tools need from the composition. */
export interface GovernanceToolSurface {
  tools: IegContext['tools']
  guarded: (capability: string, attach: () => void) => void
  note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void
  governance: GovernanceState
  /**
   * The mount record the status tool reports.
   *
   * Typed structurally rather than by importing the entry point's interface: a host module
   * importing `index` would close a cycle, and the surface exists so this module does not
   * reach back into the composition.
   */
  mount: {
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
    compatibility: unknown
  }
  diagnostics: { recent: (limit: number) => unknown, formatLine: () => string, counts: () => unknown }
  livePromptFacts: () => { source: string, version: string, bytes: number }
  promptFilePath: string
  persistOrientation: (snapshot: Record<string, unknown>, exec: unknown) => Promise<void>
  workspacePolicy: {
    policy: 'allow' | 'ask' | 'deny'
    protectedPaths: readonly string[]
    mutatingTools: readonly string[]
    classifyShellCommands?: boolean
  }
}

/** Register the governance tools. */
export function registerGovernanceTools(surface: GovernanceToolSurface): void {
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
        surface.note(code, { tool: definition.name, agentId: agentIdOf(((exec ?? {}) as { agent?: unknown }).agent) })
        return result
      },
    })

    surface.guarded('tools.record_orientation', () => {
      surface.tools?.register(
        observed(
          orientationToolDefinition((exec) => surface.governance.forAgent(((exec ?? {}) as { agent?: unknown }).agent).orientation, {
            onRecorded: surface.persistOrientation,
          }),
          'ieg.orientation_recorded',
        ),
      )
    })
    // Channel B (§28.3): the read-only surface an agent or operator can query.

    surface.guarded('tools.ieg_status', () => {
      surface.tools?.register({
        name: STATUS_TOOL_NAME,
        description:
          'Read IEG governance state: mount record, enabled modules, active configuration, host-compatibility verdict, and the recent diagnostic ring. Read-only; call it when you need to know what the governance layer is doing.',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'object' }, render: renderJson },
        execute: async (_args, exec) => ({
          mount: surface.mount,
          prompt: ((): Record<string, unknown> => {
            const live = surface.livePromptFacts()
            return {
              source: live.source,
              file: surface.promptFilePath,
              version: live.version,
              bytes: live.bytes,
            }
          })(),
          compatibility: surface.mount.compatibility,
          agentId: agentIdOf(((exec ?? {}) as { agent?: unknown }).agent),
          status_line: surface.diagnostics.formatLine(),
          maintenance: ((): Record<string, unknown> => {
            const counter = surface.governance.forAgent(((exec ?? {}) as { agent?: unknown }).agent).batches
            return {
              instruction_batches: counter.count,
              threshold: MAINTENANCE_BATCH_THRESHOLD,
              required: counter.required,
              rounds_completed: counter.roundsCompleted,
            }
          })(),
          diagnostics: surface.diagnostics.recent(20),
          diagnostic_counts: surface.diagnostics.counts(),
        }),
      })
    })
    // Channel C (Batch 6 §3): one manually triggerable maintenance round. It is
    // read-only by construction, so it is registered without a mutation gate, and
    // it reports rather than acts: Batch 6 §5 forbids claiming automatic
    // synchronization, and an automatic round could rewrite the user's documents.

    surface.guarded('tools.confirm_terminology', () => {
      surface.tools?.register({
        ...confirmationToolDefinition((exec, input) => {
          const store = surface.governance.forAgent(((exec ?? {}) as { agent?: unknown }).agent).orientation
          const result = store.confirmTerm(input)
          surface.note(
            'ieg.terminology_confirmed',
            { term: input.term, status: result.status, agentId: agentIdOf(((exec ?? {}) as { agent?: unknown }).agent) },
            `ieg: terminology_confirmed term=${input.term} status=${String(result.status)}`,
          )
          return result
        }),
        output: { schema: { type: 'object' }, render: renderJson },
      })
    })

    const guard = (execution: IegToolExecution): string | undefined => guardBackstop(execution, surface.workspacePolicy)

    surface.guarded('tools.guard', () => {
      surface.tools?.guard(guard)
    })
}
