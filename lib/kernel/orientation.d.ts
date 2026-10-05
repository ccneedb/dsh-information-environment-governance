/**
 * IEG kernel — orientation capture and its enforcement gate.
 *
 * The behavioural evaluation exposed a real defect: the `agent/pre-step`
 * orientation gate could never be satisfied, because nothing in the plugin ever
 * populated project state. `orientationGate: 'reject'` would therefore have
 * blocked every step forever.
 *
 * This module closes that loop. It gives the agent one explicit way to declare
 * orientation, and it refuses the first persistent workspace mutation until that
 * declaration exists. That converts objective 1 ("proactively align intent and
 * terminology and plan the global task flow, without waiting for user
 * reminders") from a hope about prose into a mechanically enforced step.
 *
 * The gate fires at most once per session, before the first mutation, so it
 * costs one extra tool call rather than adding friction to every action.
 */
import { createProjectState } from '../modules/project-governance.js';
/** The model-facing tool that records orientation. */
export declare const ORIENTATION_TOOL_NAME = "record_orientation";
/**
 * The model-facing tool that *requests* user confirmation of a term (R8-01).
 *
 * It is registered like any other tool, but the host routes every call through its
 * approval service before the body below runs, so the model cannot manufacture a
 * confirmed entry: the user's approval is the authority, and a denial means
 * `confirmTerm` is never reached.
 */
export declare const CONFIRM_TOOL_NAME = "confirm_terminology";
/** Raised when a tool call supplies an orientation the contract rejects. */
export declare class OrientationError extends Error {
    constructor(message: string);
}
/** The orientation store's public surface. */
interface OrientationStore {
    record(input: unknown): Record<string, unknown>;
    /** Promote a term with user authority. Reachable only from an approved tool call. */
    confirmTerm(input: {
        term: string;
        definition?: string;
        aliases?: string[];
        scope?: string;
    }): Record<string, unknown>;
    snapshot(): Record<string, unknown>;
    hydrate(value: unknown): boolean;
    state(): ReturnType<typeof createProjectState>;
    plan(): readonly string[];
    isRecorded(): boolean;
    status(): {
        oriented: boolean;
        missing: string[];
    };
}
/**
 * Create the orientation store.
 */
export declare function createOrientationStore(): OrientationStore;
/**
 * The model-facing tool definition. Registered through the tool registry, so the
 * agent discovers it exactly like any host tool.
 *
 * The store is resolved **per call** from the execution's live agent, because
 * orientation is per-agent state (ARCHITECTURE-SPEC Part B §25). Resolving at
 * call time rather than capturing one store at registration is what keeps two
 * concurrent agents from sharing a single orientation.
 */
export declare function orientationToolDefinition(getStore: (exec: unknown) => ReturnType<typeof createOrientationStore>, options?: {
    onRecorded?: (snapshot: Record<string, unknown>, exec: unknown) => Promise<void> | void;
}): IegToolDefinition;
/**
 * Decide whether a call must be refused because orientation is missing.
 *
 * Precedence in the pipeline is: read-only, then a protected path, then this
 * requirement, then the workspace policy. Returning `deny` (rather than `ask`)
 * is deliberate: the requirement is a process step, not a decision the user
 * should be asked to make.
 */
export declare function orientationRequirement(classification: {
    kind: 'read-only' | 'persistent-mutation';
    protected: boolean;
}, config: {
    requireBeforeMutation: boolean;
}, store: ReturnType<typeof createOrientationStore>): {
    kind: 'deny';
    reason: string;
} | null;
/**
 * The tool definition for {@link CONFIRM_TOOL_NAME} (R8-01).
 *
 * `run` is supplied by the host entry point and is only ever reached after the host has
 * approved the call, which is why the kernel can expose a promotion path at all without
 * giving the model authority.
 */
export declare function confirmationToolDefinition(run: (exec: unknown, input: {
    term: string;
    definition?: string;
    aliases?: string[];
    scope?: string;
}) => Record<string, unknown>): Omit<IegToolDefinition, 'output'>;
export {};
