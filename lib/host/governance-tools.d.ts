/**
 * IEG host layer — the governance tool registrations (R8-05).
 *
 * The orientation capture, the read-only status surface, the gated terminology
 * confirmation and the mutation backstop, plus the audit wrapper they all use. Each was
 * bound to the entry point's closure; naming the dependencies on a surface is what lets
 * the entry point read as composition rather than one large closure.
 */
import { type GovernanceState } from '../kernel/state.js';
/** What the governance tools need from the composition. */
export interface GovernanceToolSurface {
    tools: IegContext['tools'];
    guarded: (capability: string, attach: () => void) => void;
    note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void;
    governance: GovernanceState;
    /**
     * The mount record the status tool reports.
     *
     * Typed structurally rather than by importing the entry point's interface: a host module
     * importing `index` would close a cycle, and the surface exists so this module does not
     * reach back into the composition.
     */
    mount: {
        mounted: boolean;
        degraded: string[];
        promptVersion: string;
        promptOverridden: boolean;
        promptIssues: string[];
        compiledPromptBytes: number;
        sectionName: string;
        sectionOrder: number;
        promptBytes: number;
        modules: string[];
        moduleCount: number;
        compatibility: unknown;
    };
    diagnostics: {
        recent: (limit: number) => unknown;
        formatLine: () => string;
        counts: () => unknown;
    };
    livePromptFacts: () => {
        source: string;
        version: string;
        bytes: number;
    };
    promptFilePath: string;
    persistOrientation: (snapshot: Record<string, unknown>, exec: unknown) => Promise<void>;
    workspacePolicy: {
        policy: 'allow' | 'ask' | 'deny';
        protectedPaths: readonly string[];
        mutatingTools: readonly string[];
        classifyShellCommands?: boolean;
    };
}
/** Register the governance tools. */
export declare function registerGovernanceTools(surface: GovernanceToolSurface): void;
