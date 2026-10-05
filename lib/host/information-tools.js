/**
 * IEG host layer — the information-integrity tools (R8-05).
 *
 * `record_information` captures a claim and moves it through the lifecycle;
 * `confirm_information` requests revalidation. Both were bound to the live agent's ledger
 * through the entry point's closure, so extracting them means naming the dependency: the
 * surface carries a way to reach the calling agent's ledger, and nothing here reaches
 * back into the composition.
 */
import { CONFIRM_INFORMATION_TOOL_NAME, RECORD_INFORMATION_TOOL_NAME, renderJson, } from './tool-surface.js';
import { agentIdOf } from '../kernel/state.js';
import { addRecord, applyTransition, disposeRecord, } from '../modules/information-integrity.js';
/** The agent a tool execution belongs to. */
function agentOf(exec) {
    return (exec ?? {}).agent;
}
/** Register the information-integrity tools. */
export function registerInformationTools(surface) {
    surface.guarded('tools.record_information', () => {
        surface.tools?.register({
            name: RECORD_INFORMATION_TOOL_NAME,
            description: 'Record a piece of project information, or move it through its lifecycle. Use a status to mark an item invalid, superseded, deprecated or suspect, and a disposition to record how a wrong item was corrected, replaced, quarantined or removed. Recording never makes information authoritative: promotion to AUTHORITATIVE requires evidence or the user\'s explicit confirmation, which is a separate, approved call.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'A stable identifier for the information item.' },
                    value: { type: 'string', description: 'The information itself, or the replacement when correcting.' },
                    status: { type: 'string', description: 'A lifecycle status to move to. Omit when recording a new item.' },
                    evidence: { type: 'string', description: 'What justifies the transition, when evidence exists.' },
                    disposition: { type: 'string', description: 'For a wrong item: CORRECTED | REPLACED | QUARANTINED | REMOVED.' },
                },
                required: ['id'],
            },
            output: { schema: { type: 'object' }, render: renderJson },
            execute: async (args, exec) => {
                const raw = (args ?? {});
                const id = typeof raw.id === 'string' ? raw.id.trim() : '';
                if (id === '')
                    return { ok: false, reason: 'id is required' };
                const ledger = surface.ledgerFor(agentOf(exec));
                const value = typeof raw.value === 'string' ? raw.value : '';
                const evidence = typeof raw.evidence === 'string' ? raw.evidence : undefined;
                if (typeof raw.disposition === 'string' && raw.disposition.trim() !== '') {
                    const disposed = disposeRecord(ledger, id, raw.disposition.trim().toUpperCase(), value);
                    surface.note('ieg.information_invalidated', { id, disposition: raw.disposition, ok: disposed.ok, agentId: agentIdOf((exec ?? {}).agent) }, `ieg: information_invalidated id=${id} disposition=${String(raw.disposition)}`);
                    return disposed;
                }
                if (typeof raw.status === 'string' && raw.status.trim() !== '') {
                    const moved = applyTransition(ledger, id, raw.status.trim().toUpperCase(), evidence === undefined ? {} : { evidence });
                    surface.note('ieg.information_invalidated', { id, to: raw.status, ok: moved.ok, agentId: agentIdOf((exec ?? {}).agent) }, `ieg: information_transition id=${id} to=${String(raw.status)} ok=${moved.ok}`);
                    return moved;
                }
                return { ok: true, record: addRecord(ledger, { id, value, provenance: 'agent' }) };
            },
        });
    });
    // R8-02 §5: revalidation. The gate above returns `ask` for every call, so this body
    // is reached only once the user has approved — which is what makes the promotion
    // below legitimate rather than self-granted.
    surface.guarded('tools.confirm_information', () => {
        surface.tools?.register({
            name: CONFIRM_INFORMATION_TOOL_NAME,
            description: 'Ask the user to revalidate a piece of project information and, on approval, promote it to AUTHORITATIVE. Use it only when the user has actually confirmed the item; a denial leaves the current status untouched.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'The information item to revalidate.' },
                    evidence: { type: 'string', description: 'What the user relied on, faithful in substance.' },
                },
                required: ['id'],
            },
            output: { schema: { type: 'object' }, render: renderJson },
            execute: async (args, exec) => {
                const raw = (args ?? {});
                const id = typeof raw.id === 'string' ? raw.id.trim() : '';
                const ledger = surface.ledgerFor(agentOf(exec));
                const promoted = applyTransition(ledger, id, 'AUTHORITATIVE', {
                    evidence: typeof raw.evidence === 'string' ? raw.evidence : undefined,
                    userConfirmation: true,
                });
                surface.note('ieg.information_invalidated', { id, revalidated: promoted.ok, agentId: agentIdOf((exec ?? {}).agent) }, `ieg: information_revalidated id=${id} ok=${promoted.ok}`);
                return promoted;
            },
        });
    });
    // R8-01: the confirmation path. The gate above returns `ask` for every call, so
    // this body is reached only once the user has approved.
}
