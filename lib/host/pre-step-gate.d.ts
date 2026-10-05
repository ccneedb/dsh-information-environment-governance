/**
 * IEG host layer — the pre-step orientation gate (R8-05).
 *
 * Section 2 of the entry point: on every step, decide whether the agent has oriented
 * itself before it is allowed to continue, and count direct user instruction batches so
 * the maintenance round can be announced. Extracted with its dependencies named on a
 * surface rather than captured from the composition.
 */
import { type GovernanceState } from '../kernel/state.js';
/** What the pre-step gate needs from the composition. */
export interface PreStepGateSurface {
    /** Record one diagnostic. */
    note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void;
    /** Mount one capability, recording a degradation instead of failing the mount. */
    guarded: (capability: string, attach: () => void) => void;
    /** Live per-agent governance state. */
    governance: GovernanceState;
    /** The configured gate mode. */
    orientationGate: 'off' | 'warn' | 'reject';
    /** Register the handler on the host context. */
    on: (event: 'agent/pre-step', handler: (payload: IegPreStepPayload, next: () => Promise<IegPreStepDecision>) => Promise<IegPreStepDecision>) => void;
}
/** Register the pre-step orientation gate. */
export declare function registerPreStepGate(surface: PreStepGateSurface): void;
