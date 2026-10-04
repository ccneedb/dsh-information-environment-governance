/**
 * `dsh-ieg` — the IEG prompt CLI.
 *
 * Scope (`ARCHITECTURE-SPEC` §28.6, reduced in Batch 5): **viewing and editing
 * the governance prompt**, plus the base metadata a CLI always carries
 * (`--help`, `--version`). Installation, update, uninstall and lifecycle control
 * are DSH's responsibility — a plugin cannot install itself, and `dsh-market`
 * plus the host's plugin installer are the only official entry paths. This
 * command therefore has no installation surface and no lifecycle state.
 *
 * ```text
 * dsh-ieg prompt         view the effective text, its version and byte count
 * dsh-ieg prompt edit    $EDITOR round-trip: validate, then store prompt.md
 * ```
 *
 * Arg parsing, and the `$EDITOR` invocation, are hand-rolled over Node builtins:
 * the package ships with **zero runtime dependencies**.
 *
 * Exit codes: 0 success · 1 refused/failed · 2 usage or environment error.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROMPT_FILE_NAME, readPromptFile, resolveEffectivePrompt, resolvePromptPath, validatePromptText, writePromptFile, } from '../kernel/prompt-store.js';
/** EPIPE guard: a shell user pipes this (`dsh-ieg prompt | head`). */
const stdoutStream = process.stdout;
stdoutStream.on?.('error', (error) => {
    if (error && error.code === 'EPIPE')
        process.exit(0);
});
const HERE = dirname(fileURLToPath(import.meta.url));
let kernelPromise;
/**
 * Load the plugin entry lazily and by computed path.
 *
 * The entry is the compiled aggregator, so it is imported at runtime rather than
 * statically referenced: the CLI only needs its exported kernel, and the computed
 * specifier keeps the TypeScript build from type-resolving the emitted JavaScript.
 */
async function loadKernel() {
    if (kernelPromise === undefined) {
        kernelPromise = import(join(HERE, '..', 'index.js'));
    }
    return kernelPromise;
}
/* ── output ─────────────────────────────────────────────────────────────────── */
function out(line) {
    process.stdout.write(`${line}\n`);
}
function err(line) {
    process.stderr.write(`${line}\n`);
}
const USAGE = `dsh-ieg — the IEG prompt CLI

usage:  dsh-ieg <command>

commands:
  prompt         print the effective governance prompt, its version and byte count
  prompt edit    edit the prompt in $EDITOR, validate it, and store it as ${PROMPT_FILE_NAME}

  --help, -h     this text
  --version, -v  the installed plugin version

Installation, update and uninstall are DSH's job:
  dsh plugin --profile <profile> add <plugin-source>
The prompt file lives at $IEG_PROMPT_FILE, else <state-dir>/ieg/${PROMPT_FILE_NAME}.
`;
/* ── the effective prompt ───────────────────────────────────────────────────── */
/**
 * Resolve the text the plugin emits, given the operator's prompt file.
 *
 * The CLI does not know a composition's `prompt` config, so it resolves the
 * audited compiled default plus the operator file — the same precedence the
 * runtime applies when no config layer intervenes.
 *
 * @returns {Promise<{ prompt: EffectivePrompt, promptPath: string }>}
 */
async function effective() {
    const kernel = await loadKernel();
    const promptPath = resolvePromptPath();
    const file = readPromptFile(promptPath);
    const compiled = kernel.buildGovernance({ prompt: { mode: 'compiled' } }).compiledPrompt;
    const prompt = resolveEffectivePrompt({
        basePrompt: compiled,
        mode: 'compiled',
        promptFileText: file.text,
        promptFilePath: promptPath,
    });
    return { prompt, promptPath };
}
async function commandPrompt() {
    const kernel = await loadKernel();
    const { prompt, promptPath } = await effective();
    out(prompt.text);
    out('');
    out(`ieg prompt: version ${kernel.PROMPT_VERSION}${prompt.versionSuffix} ` +
        `bytes ${prompt.bytes} source ${prompt.source} file ${promptPath}`);
    for (const issue of prompt.issues)
        err(`ieg: ${issue}`);
    return prompt.issues.length === 0 ? 0 : 1;
}
/**
 * Open `$EDITOR` on a temporary copy, validate what comes back, and store it.
 *
 * A refusal changes nothing: the previous effective text stays in force, its
 * reasons are printed, and the exit code is 1.
 *
 */
async function commandPromptEdit() {
    const editor = process.env.EDITOR ?? process.env.VISUAL;
    if (editor === undefined || editor.trim() === '') {
        err('ieg: set $EDITOR (or $VISUAL) to edit the prompt');
        return 2;
    }
    const kernel = await loadKernel();
    const { prompt, promptPath } = await effective();
    const scratch = mkdtempSync(join(tmpdir(), 'ieg-prompt-'));
    const file = join(scratch, PROMPT_FILE_NAME);
    writeFileSync(file, `${prompt.text}\n`);
    try {
        // Split `$EDITOR` so a value like `code --wait` works without a shell.
        const [editorCommand, ...editorArgs] = editor.trim().split(/\s+/);
        const result = spawnSync(editorCommand, [...editorArgs, file], { stdio: 'inherit' });
        if (result.status !== 0) {
            err(`ieg: the editor exited ${result.status ?? 'without a status'}; nothing was stored`);
            return 1;
        }
        const candidate = readFileSync(file, 'utf8').trim();
        if (candidate === '') {
            err('ieg: the edited prompt is empty; nothing was stored');
            return 1;
        }
        const validated = validatePromptText({ basePrompt: kernel.buildGovernance({ prompt: { mode: 'compiled' } }).compiledPrompt, text: candidate });
        if (!validated.applied) {
            err('ieg: prompt edit refused; the previous effective text is unchanged');
            for (const issue of validated.issues)
                err(`ieg: ${issue}`);
            return 1;
        }
        writePromptFile(promptPath, validated.text);
        out(`ieg: prompt stored in ${promptPath}`);
        out(`ieg: version ${kernel.PROMPT_VERSION}${validated.versionSuffix} bytes ${validated.bytes} (applied from the next step)`);
        for (const unchecked of validated.unchecked)
            err(`ieg: note: ${unchecked}`);
        return 0;
    }
    finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}
/* ── entry ──────────────────────────────────────────────────────────────────── */
/**
 * @param {string[]} argv
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
    const [command, subcommand] = argv;
    switch (command) {
        case undefined:
        case '':
        case 'help':
        case '--help':
        case '-h':
            out(USAGE);
            return 0;
        case '--version':
        case '-v':
        case 'version': {
            const kernel = await loadKernel();
            out(kernel.PLUGIN_VERSION);
            return 0;
        }
        case 'prompt':
            if (subcommand === 'edit')
                return commandPromptEdit();
            if (subcommand !== undefined) {
                err(`ieg: unknown subcommand 'prompt ${subcommand}'`);
                err(USAGE);
                return 2;
            }
            return commandPrompt();
        default:
            err(`ieg: unknown command '${command}'`);
            err(USAGE);
            return 2;
    }
}
