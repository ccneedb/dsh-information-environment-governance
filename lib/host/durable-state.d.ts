/**
 * IEG host layer — durable governance state (R8-05).
 *
 * The "durable state" section of the entry point: an optional storage domain that restores
 * a resumed session's orientation and persists a new one, degrading to "no persistence" —
 * never to "no enforcement" — when storage is absent or fails.
 *
 * Extracted as a factory because the section owns state: the store handle it may or may not
 * obtain, and the set of sessions already looked up so a resumed session costs one read
 * rather than one per call.
 */
import type { GovernanceState } from '../kernel/state.js';
/** What durable state needs from the composition. */
export interface DurableStateInput {
    /** The host context, for the storage seam and disposal. */
    ctx: IegContext;
    /** Record one diagnostic. */
    note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void;
    /** Mount one capability, recording a degradation instead of failing the mount. */
    guarded: (capability: string, attach: () => void) => void;
    /** Live per-agent governance state. */
    governance: GovernanceState;
}
/** The durable-state operations the composition uses. */
export interface DurableState {
    /** Restore one agent's orientation; resolves whether a usable snapshot was restored. */
    hydrateOrientation: (agent: unknown) => Promise<boolean>;
    /** Persist an orientation snapshot for the agent behind an execution. */
    persistOrientation: (snapshot: Record<string, unknown>, exec: unknown) => Promise<void>;
}
/** Build the durable-state operations. */
export declare function createDurableState(input: DurableStateInput): DurableState;
