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
/**
 * @param {string[]} argv
 * @returns {Promise<number>} the process exit code
 */
export declare function main(argv: string[]): Promise<number>;
