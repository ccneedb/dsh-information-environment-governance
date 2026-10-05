/**
 * IEG host layer — the model-facing tool surface (R8-05).
 *
 * The host layer is where IEG meets DSH: tool names, the projection of a tool's
 * canonical value to model content, and the set of tools that confer user authority.
 * Splitting these out of `src/index.ts` is the first step of R8-05's decomposition —
 * the entry point should compose and wire, not define the surface.
 *
 * This module holds no state and takes no closures, which is why it can move first:
 * everything else in the entry point is bound to a live agent's governance state.
 */
/** The read-only tool that reports governance state to the model and operator. */
export declare const STATUS_TOOL_NAME = "ieg_status";
/**
 * The manual maintenance trigger (Batch 6 §3).
 *
 * It is a *report*, not a mutation: the round classifies, diagnoses and proposes, and
 * every destructive proposal waits for an explicit decision. That is why it needs no
 * mutation gate — an unknown tool is read-only by construction.
 */
export declare const MAINTENANCE_TOOL_NAME = "maintain_environment";
/** The model-facing tool that captures information and moves it through the lifecycle. */
export declare const RECORD_INFORMATION_TOOL_NAME = "record_information";
/**
 * The model-facing tool that requests *revalidation* of information (R8-02 §5).
 *
 * Revalidation is promotion to `AUTHORITATIVE`, which the lifecycle already refuses
 * without evidence or explicit user confirmation. The model may ask; only the host's
 * approval service can supply the confirmation, exactly as for terminology (R8-01).
 */
export declare const CONFIRM_INFORMATION_TOOL_NAME = "confirm_information";
/**
 * Tools whose every call is routed through the host's approval service,
 * unconditionally and independently of `workspace.policy`, because they confer user
 * authority rather than mutating the workspace.
 */
export declare const USER_AUTHORITY_TOOLS: readonly string[];
/**
 * Project one read-only tool's canonical JSON value to model content.
 *
 * A tool result reaches the model only through `render`, so returning no blocks means
 * the call succeeds and shows the caller nothing.
 */
export declare function renderJson(_args: unknown, value: unknown): Array<{
    type: 'text';
    text: string;
}>;
