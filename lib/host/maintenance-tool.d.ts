/**
 * IEG host layer — the maintenance round's tool registration (R8-05).
 *
 * R8-05 asks the entry point to become composition and wiring. This block was bound to
 * the live agent's state through a closure, so extracting it means naming that dependency
 * instead of capturing it: `surface` carries exactly what the tool needs, and nothing in
 * here reaches into the composition.
 */
import { type BatchCounter } from '../kernel/state.js';
/** What the maintenance tool needs from the composition. */
export interface MaintenanceToolSurface {
    /** The injected tool registry. */
    tools: IegContext['tools'];
    /** Mount one capability, recording a degradation instead of failing the mount. */
    guarded: (capability: string, attach: () => void) => void;
    /** Record one diagnostic. */
    note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void;
    /** The host filesystem service, if the composition has one. */
    fs: () => IegFileSystemService | undefined;
    /**
     * The current versions, passed in rather than imported from the entry point: a host
     * module importing `index` would close a cycle, and the surface exists precisely so
     * this module does not reach back into the composition.
     */
    versions: {
        plugin: string;
        prompt: string;
    };
    /** The calling agent's maintenance counter, for reporting and reset. */
    counterFor: (agent: unknown) => BatchCounter;
    /** Reset the counter after a completed round. */
    completeRound: (agent: unknown) => void;
}
/** Register the maintenance round's tool. */
export declare function registerMaintenanceTool(surface: MaintenanceToolSurface): void;
