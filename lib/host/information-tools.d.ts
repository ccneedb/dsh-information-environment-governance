/**
 * IEG host layer — the information-integrity tools (R8-05).
 *
 * `record_information` captures a claim and moves it through the lifecycle;
 * `confirm_information` requests revalidation. Both were bound to the live agent's ledger
 * through the entry point's closure, so extracting them means naming the dependency: the
 * surface carries a way to reach the calling agent's ledger, and nothing here reaches
 * back into the composition.
 */
import { type InformationLedger } from '../modules/information-integrity.js';
/** What the information tools need from the composition. */
export interface InformationToolSurface {
    /** The injected tool registry. */
    tools: IegContext['tools'];
    /** Mount one capability, recording a degradation instead of failing the mount. */
    guarded: (capability: string, attach: () => void) => void;
    /** Record one diagnostic. */
    note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void;
    /** The calling agent's information ledger. */
    ledgerFor: (agent: unknown) => InformationLedger;
}
/** Register the information-integrity tools. */
export declare function registerInformationTools(surface: InformationToolSurface): void;
