/**
 * IEG host layer — the mutation gate (R8-05).
 *
 * Section 3 of the entry point: the `tools/pre-execute` waterfall that classifies a
 * workspace mutation, applies the protected-path boundary and the orientation
 * requirement, checks information reintroduction, and returns allow/deny/ask. Extracted
 * with its dependencies named on a surface; the host context is passed rather than reached
 * for, and the kernel functions it calls are imported directly.
 */
import { type GovernanceState } from '../kernel/state.js';
import { resolveConfig } from '../kernel/config.js';
/** What the mutation gate needs from the composition. */
export interface MutationGateSurface {
    /** Record one diagnostic. */
    note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void;
    /** Mount one capability, recording a degradation instead of failing the mount. */
    guarded: (capability: string, attach: () => void) => void;
    /** Live per-agent governance state. */
    governance: GovernanceState;
    /** The effective workspace policy, exactly as configured. */
    workspace: ReturnType<typeof resolveConfig>['workspace'];
    /** The pre-step configuration the gate consults, exactly as configured. */
    preStep: ReturnType<typeof resolveConfig>['preStep'];
    /** The host context, for filesystem access and event registration. */
    ctx: IegContext;
    /** Restore an agent's orientation from durable storage before evaluating the gate. */
    hydrateOrientation: (agent: unknown) => Promise<boolean>;
    /**
     * Whether the composition exposes an approval service.
     *
     * Detected through the same optional `get` seam IEG already uses for `fs`; the host
     * contract declares no `approval` member on the injected context. This changes no
     * approval semantics — the gate still returns `ask` and the host still decides.
     */
    approvalAvailable: boolean;
}
/** Register the mutation gate. */
export declare function registerMutationGate(surface: MutationGateSurface): void;
