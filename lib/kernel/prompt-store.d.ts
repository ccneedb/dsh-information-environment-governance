/**
 * IEG kernel — the prompt store (`ARCHITECTURE-SPEC` §27.1, 0.6.0).
 *
 * Prompt text lives in its own file, `prompt.md`, resolved by
 * {@link resolvePromptPath}, so the stored text and its location stay
 * the text stays something a human edits as text. This module owns that file and
 * the precedence that decides which text the plugin actually emits.
 *
 * Validation is deliberately **not** re-implemented here: every candidate goes
 * through `composePromptOverride`, the existing, tested override kernel. That is
 * what makes the CLI, a config-supplied file, and the compiled default obey the
 * same two hard rules — no `{{ }}` interpolation syntax, and the byte ceiling
 * unless explicitly allowed — and it is what gives an accepted override the
 * attribution `PROMPT_VERSION+user:<hash>`.
 *
 * Precedence, as documented in the README:
 *
 * ```text
 * operator prompt.md                                  (highest)
 *   > config prompt.file   (only when prompt.mode: replace)
 *   > config prompt.append (only when prompt.mode: append)
 *   > the compiled default                                 (lowest)
 * ```
 *
 * `prompt.mode: compiled` therefore yields the compiled default whenever no
 * operator `prompt.md` exists; `ieg prompt reset` is how an operator returns
 * to it. A `prompt.md` that exists but is refused never becomes effective: the
 * next lower source is used and the refusal reasons are reported.
 */
import { type PromptOverrideResult } from './prompt-override.js';
/** The prompt file's fixed name, inside the resolved prompt directory. */
export declare const PROMPT_FILE_NAME = "prompt.md";
/** Input to {@link resolvePromptPath}. */
export interface PromptPathInput {
    /** Environment to read, defaulting to `process.env`. */
    env?: Record<string, string | undefined>;
    /** Home directory, defaulting to `os.homedir()`. */
    home?: string;
}
/**
 * Resolve the operator's `prompt.md` path.
 *
 * `$IEG_PROMPT_FILE` wins; otherwise `<state-dir>/ieg/prompt.md`, where
 * `<state-dir>` is `$XDG_STATE_HOME` or `~/.local/state`. This is the whole of
 * the location policy — there is no control record, generation counter or
 * lifecycle state behind it (Batch 5 removed those).
 */
export declare function resolvePromptPath(input?: PromptPathInput): string;
/** Where the effective text came from. */
export type IegPromptSource = 'prompt-file' | 'config-file' | 'config-append' | 'compiled';
/** Input to {@link resolveEffectivePrompt}. */
export interface EffectivePromptInput {
    /** The audited compiled section, which every candidate is validated against. */
    basePrompt: string;
    /** The config layer's mode. */
    mode: 'compiled' | 'append' | 'replace';
    /** Config `prompt.append`, used when `mode` is `append`. */
    append?: string;
    /** Contents of config `prompt.file`, used when `mode` is `replace`. */
    configText?: string;
    /** Contents of the operator `prompt.md`, when one exists. */
    promptFileText?: string;
    /** Path of the operator `prompt.md`, for reporting only. */
    promptFilePath?: string;
    /** Accept text over the byte ceiling, deliberately and visibly. */
    allowOverBudget?: boolean;
}
/** The text the plugin will emit, and exactly why. */
export interface EffectivePrompt {
    text: string;
    /** Whether a user-authored override is in force. */
    applied: boolean;
    source: IegPromptSource;
    /** `+user:<hash>` when an override applied; `''` otherwise. */
    versionSuffix: string;
    /** Hard-rule refusals and informational notes, in the order they were found. */
    issues: string[];
    /** Soft invariants that no longer apply once the text is user-authored. */
    unchecked: string[];
    bytes: number;
    promptFilePath: string;
    /** Whether a operator `prompt.md` existed but was refused. */
    promptFileRefused: boolean;
}
/** Resolve the effective governance prompt for one profile. Pure; no I/O. */
export declare function resolveEffectivePrompt(input: EffectivePromptInput): EffectivePrompt;
/** Result of reading the operator's prompt file. */
export interface PromptFileRead {
    text?: string;
    present: boolean;
    issue?: string;
}
/** Read `prompt.md`, tolerating absence and read errors. Never throws. */
export declare function readPromptFile(file: string): PromptFileRead;
/** Write `prompt.md` atomically: sibling temporary file, then rename. */
export declare function writePromptFile(file: string, text: string): void;
/** Validate candidate replacement text through the existing override kernel. */
export declare function validatePromptText(input: {
    basePrompt: string;
    text: string;
    allowOverBudget?: boolean;
}): PromptOverrideResult & {
    bytes: number;
};
/** `PROMPT_VERSION` with an override's attribution suffix appended. */
export declare function attributedPromptVersion(promptVersion: string, versionSuffix: string): string;
