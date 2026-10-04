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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { utf8Bytes } from './prompt-compiler.js';
import { composePromptOverride } from './prompt-override.js';
/** The prompt file's fixed name, inside the resolved prompt directory. */
export const PROMPT_FILE_NAME = 'prompt.md';
/**
 * Resolve the operator's `prompt.md` path.
 *
 * `$IEG_PROMPT_FILE` wins; otherwise `<state-dir>/ieg/prompt.md`, where
 * `<state-dir>` is `$XDG_STATE_HOME` or `~/.local/state`. This is the whole of
 * the location policy — there is no control record, generation counter or
 * lifecycle state behind it (Batch 5 removed those).
 */
export function resolvePromptPath(input = {}) {
    const env = input.env ?? process.env;
    const explicit = env.IEG_PROMPT_FILE;
    if (typeof explicit === 'string' && explicit.trim() !== '')
        return explicit;
    const stateDir = (typeof env.XDG_STATE_HOME === 'string' && env.XDG_STATE_HOME.trim() !== '')
        ? env.XDG_STATE_HOME
        : join(input.home ?? homedir(), '.local', 'state');
    return join(stateDir, 'ieg', PROMPT_FILE_NAME);
}
/** Adapt a composition result to the store's return shape. */
function outcome(composed, source, input, extraIssues, promptFileRefused) {
    return {
        text: composed.text,
        applied: composed.applied,
        source,
        versionSuffix: composed.versionSuffix,
        issues: [...extraIssues, ...composed.issues],
        unchecked: composed.unchecked,
        bytes: utf8Bytes(composed.text),
        promptFilePath: input.promptFilePath ?? '',
        promptFileRefused,
    };
}
/** Resolve the effective governance prompt for one profile. Pure; no I/O. */
export function resolveEffectivePrompt(input) {
    const base = input.basePrompt;
    let promptIssues = [];
    let promptFileRefused = false;
    // 1. The operator's prompt file. A non-empty prompt.md is the current choice and
    //    outranks every configuration layer.
    if (typeof input.promptFileText === 'string' && input.promptFileText.trim() !== '') {
        const composed = composePromptOverride({
            mode: 'replace',
            overrideText: input.promptFileText,
            basePrompt: base,
            allowOverBudget: input.allowOverBudget,
        });
        if (composed.applied)
            return outcome(composed, 'prompt-file', input, [], false);
        promptFileRefused = true;
        promptIssues = composed.issues.map((issue) => `${PROMPT_FILE_NAME}: ${issue}`);
    }
    // 2. Configuration layer.
    const composed = composePromptOverride({
        mode: input.mode,
        append: input.append,
        overrideText: input.configText,
        basePrompt: base,
        allowOverBudget: input.allowOverBudget,
    });
    const source = composed.applied
        ? input.mode === 'replace'
            ? 'config-file'
            : 'config-append'
        : 'compiled';
    return outcome(composed, source, input, promptIssues, promptFileRefused);
}
/** Read `prompt.md`, tolerating absence and read errors. Never throws. */
export function readPromptFile(file) {
    try {
        return { text: readFileSync(file, 'utf8'), present: true };
    }
    catch (error) {
        const code = error?.code;
        if (code === 'ENOENT')
            return { present: false };
        const message = error instanceof Error ? error.message : String(error);
        return { present: false, issue: `prompt.md could not be read (${message})` };
    }
}
/** Write `prompt.md` atomically: sibling temporary file, then rename. */
export function writePromptFile(file, text) {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, text);
    renameSync(temporary, file);
}
/** Validate candidate replacement text through the existing override kernel. */
export function validatePromptText(input) {
    const composed = composePromptOverride({
        mode: 'replace',
        overrideText: input.text,
        basePrompt: input.basePrompt,
        allowOverBudget: input.allowOverBudget,
    });
    return { ...composed, bytes: utf8Bytes(composed.text) };
}
/** `PROMPT_VERSION` with an override's attribution suffix appended. */
export function attributedPromptVersion(promptVersion, versionSuffix) {
    return `${promptVersion}${versionSuffix}`;
}
