/**
 * IEG host layer — the governance tool registrations (R8-05).
 *
 * The orientation capture, the read-only status surface, the gated terminology
 * confirmation and the mutation backstop, plus the audit wrapper they all use. Each was
 * bound to the entry point's closure; naming the dependencies on a surface is what lets
 * the entry point read as composition rather than one large closure.
 */
import { confirmationToolDefinition, orientationToolDefinition } from '../kernel/orientation.js';
import { STATUS_TOOL_NAME, renderJson } from './tool-surface.js';
import { agentIdOf } from '../kernel/state.js';
import { guardBackstop } from '../modules/workspace-governance.js';
import { MAINTENANCE_BATCH_THRESHOLD } from '../kernel/maintenance.js';
/** Register the governance tools. */
export function registerGovernanceTools(surface) {
    /**
     * Wrap a tool so its calls are auditable without changing its contract.
     *
     * @param definition
     * @param code
     */
    const observed = (definition, code) => ({
        ...definition,
        execute: async (args, exec) => {
            const result = await definition.execute(args, exec);
            surface.note(code, { tool: definition.name, agentId: agentIdOf((exec ?? {}).agent) });
            return result;
        },
    });
    surface.guarded('tools.record_orientation', () => {
        surface.tools?.register(observed(orientationToolDefinition((exec) => surface.governance.forAgent((exec ?? {}).agent).orientation, {
            onRecorded: surface.persistOrientation,
        }), 'ieg.orientation_recorded'));
    });
    // Channel B (§28.3): the read-only surface an agent or operator can query.
    surface.guarded('tools.ieg_status', () => {
        surface.tools?.register({
            name: STATUS_TOOL_NAME,
            description: 'Read IEG governance state: mount record, enabled modules, active configuration, host-compatibility verdict, and the recent diagnostic ring. Read-only; call it when you need to know what the governance layer is doing.',
            parameters: { type: 'object', properties: {} },
            output: { schema: { type: 'object' }, render: renderJson },
            execute: async (_args, exec) => ({
                mount: surface.mount,
                prompt: (() => {
                    const live = surface.livePromptFacts();
                    return {
                        source: live.source,
                        file: surface.promptFilePath,
                        version: live.version,
                        bytes: live.bytes,
                    };
                })(),
                compatibility: surface.mount.compatibility,
                agentId: agentIdOf((exec ?? {}).agent),
                status_line: surface.diagnostics.formatLine(),
                maintenance: (() => {
                    const counter = surface.governance.forAgent((exec ?? {}).agent).batches;
                    return {
                        instruction_batches: counter.count,
                        threshold: MAINTENANCE_BATCH_THRESHOLD,
                        required: counter.required,
                        rounds_completed: counter.roundsCompleted,
                    };
                })(),
                diagnostics: surface.diagnostics.recent(20),
                diagnostic_counts: surface.diagnostics.counts(),
            }),
        });
    });
    // Channel C (Batch 6 §3): one manually triggerable maintenance round. It is
    // read-only by construction, so it is registered without a mutation gate, and
    // it reports rather than acts: Batch 6 §5 forbids claiming automatic
    // synchronization, and an automatic round could rewrite the user's documents.
    surface.guarded('tools.confirm_terminology', () => {
        surface.tools?.register({
            ...confirmationToolDefinition((exec, input) => {
                const store = surface.governance.forAgent((exec ?? {}).agent).orientation;
                const result = store.confirmTerm(input);
                surface.note('ieg.terminology_confirmed', { term: input.term, status: result.status, agentId: agentIdOf((exec ?? {}).agent) }, `ieg: terminology_confirmed term=${input.term} status=${String(result.status)}`);
                return result;
            }),
            output: { schema: { type: 'object' }, render: renderJson },
        });
    });
    const guard = (execution) => guardBackstop(execution, surface.workspacePolicy);
    surface.guarded('tools.guard', () => {
        surface.tools?.guard(guard);
    });
}
