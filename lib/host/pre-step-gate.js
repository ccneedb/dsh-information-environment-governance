/**
 * IEG host layer — the pre-step orientation gate (R8-05).
 *
 * Section 2 of the entry point: on every step, decide whether the agent has oriented
 * itself before it is allowed to continue, and count direct user instruction batches so
 * the maintenance round can be announced. Extracted with its dependencies named on a
 * surface rather than captured from the composition.
 */
import { countInstructionBatch, agentIdOf } from '../kernel/state.js';
import { MAINTENANCE_BATCH_THRESHOLD } from '../kernel/maintenance.js';
import { evaluateOrientationGate } from '../modules/project-governance.js';
/** Register the pre-step orientation gate. */
export function registerPreStepGate(surface) {
    const onPreStep = async (payload, next) => {
        // The step's own agent decides which orientation is evaluated.
        const agent = payload?.agent;
        const { orientation, batches } = surface.governance.forAgent(agent);
        // Batch 6 §6: count direct user instruction batches. The host opens one turn
        // per batch of user messages and repeats that turn for every internal step, so
        // keying on the turn (and requiring a message) excludes steps, tool calls and
        // generated context by construction.
        const counted = countInstructionBatch(batches, { turn: payload?.turn, messages: payload?.messages });
        // The diagnostic *is* the announcement, so it fires on the batch that crosses
        // the threshold and not on every counted batch. The running count is visible in
        // the status line and in `ieg_status` either way.
        if (counted.due) {
            surface.note('ieg.maintenance_due', {
                batches: batches.count,
                threshold: MAINTENANCE_BATCH_THRESHOLD,
                agentId: agentIdOf(agent),
            }, `ieg: maintenance_due batches=${batches.count}/${MAINTENANCE_BATCH_THRESHOLD} — run the maintenance round at the next safe boundary`);
        }
        const { decision, missing } = evaluateOrientationGate(orientation.state(), surface.orientationGate);
        if (decision !== null) {
            surface.note('ieg.orientation_required', { phase: 'pre-step', missing, agentId: agentIdOf(agent) }, `ieg: pre_step_rejected missing=${missing.join(',')} agent=${agentIdOf(agent) || '-'}`, 'warn');
            return decision;
        }
        if (surface.orientationGate === 'warn' && missing.length > 0) {
            surface.note('ieg.orientation_required', { phase: 'pre-step', outcome: 'warn', missing }, `ieg: orientation_incomplete missing=${missing.join(',')}`);
        }
        return next();
    };
    surface.guarded('agent/pre-step', () => {
        surface.on('agent/pre-step', onPreStep);
    });
}
