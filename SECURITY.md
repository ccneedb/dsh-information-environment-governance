---
doc_type: security-policy
project: information-environment-governance
version: 0.3.0
plugin_version: 0.12.1
status: active
owner: maintainers
last_reviewed: 2026-10-03
revision: 0.12.1-batch-7
audience: everyone
language: en
---

# Security Policy

## Project status

IEG is a **verifiable prototype**, not a production component. It is not
recommended for installation into a working profile; the model-backed behavioural
gates (C and D) are unmeasured, and the package is publishable but not published. Do not
treat IEG as a security control.

## What IEG is — and is not

IEG is a governance layer. It is **not** a sandbox, an authorization system, or a
replacement for any DeepSeek Harness safety mechanism:

- it does **not** replace DSH authorization, sandbox, permission, credential, or
  approval controls;
- its mutation governance covers **tool-mediated** mutations only, not
  process-wide writes (a plugin calling `ctx.fs.writeText()` directly bypasses
  it);
- it deliberately **fails open** for optional capabilities, so an absent storage,
  filesystem, or approval service never becomes a hard block;
- IEG **registers no approval answerer**: it gates with `ask` and inherits the
  host's fail-closed path where no approval channel exists;
- where a rule is ambiguous, IEG prefers a safe refusal (`deny`) over assuming
  authorization.

### Explicitly out of scope

The following are outside IEG's scope and must not be reported as missing
capabilities:

- general AI safety or security;
- sandboxing;
- authorization;
- user-attention optimization (**RETIRED** — the capability was withdrawn in
  0.7.0; §Known limitations item 4 states the retirement);
- unrelated agent behavior management.

Any future feature must show a direct connection to Information Environment
Governance. The canonical positioning and scope are in
[`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) §1. The accepted design-level boundaries are
enumerated in
[`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
Part B and in the "Risk" sections of that document.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's
private vulnerability reporting for this repository (the **Security** tab →
*Report a vulnerability*). If that channel is unavailable, open a minimal issue
asking for a private contact route and include no sensitive detail in it.

Include, as applicable:

- the IEG version and the `PROMPT_VERSION` reported by `ieg_status`;
- your DSH version (`dsh -V`) and the profile used;
- the effective configuration (the `ieg` row from `dsh --profile <name> --dump-config`);
- a minimal reproduction, and the `ieg_status` output;
- the impact you believe it has.

## What never to send

- Credentials, API keys, or the contents of `~/.dsh/.credentials.yaml`.
- Session logs or workspace files containing private data. Redact first; if a
  log is essential, quote only the minimum lines needed.
- Absolute paths that disclose private directory names beyond what is necessary.

## Response expectations

This is a prototype maintained on a best-effort basis. There is no guaranteed
response time and no supported release line. Fixes land on `main`; because the
durable record shape and the compiled prompt are versioned, a security-relevant
change will be recorded in [`CHANGELOG.md`](CHANGELOG.md) with the
problem it addresses.

## Known limitations (not vulnerabilities, not bugs)

This is the single home for the accepted-limits list. [`TESTING.md`](TESTING.md) §7
and [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/bug_report.yml)
link here rather than restating it; the design-level boundaries are in
[`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
Part B.

1. Mutation governance covers **tool-mediated mutations only**. A plugin that
   calls `ctx.fs.writeText()` (or otherwise writes) directly is not covered, and
   IEG does not claim process-wide coverage.
2. Shell-write classification inspects command **text**, so it recognises shells and
   execution prefixes (`bash -c …`, `sudo bash -c …`, `env bash -c …`) but not a payload
   assembled at runtime (`cmd="echo x > f"; bash -c "$cmd"`). Quoted text is treated as
   data unless the command executes another command. Supported scope is Debian/Linux +
   DSH; PowerShell and other shells are not supported and are not classified.
3. `agent/pre-step` live dispatch is exercised by wiring and decision-shape
   tests, not by a full agent loop.
4. **Question consolidation is no longer a capability at all (RETIRED).** The
   `user-attention` module and failure class `FC-2.4` were removed in 0.7.0,
   classified Out of Scope / Externally Solved. There is no question ledger, no
   `userAttention` config key, and no question-batching gate; an `ask_user_question`
   observation is not an IEG behaviour and its absence is not a defect.
5. IEG registers **no approval answerer**. `workspace.policy: 'ask'` and
   `overlapCheck: 'ask'` fail closed where no approval channel exists.
6. **Diagnostics are derived, not authoritative.** The bounded ring, the
   `ieg:status` runtime-context line, and the `ieg_status` tool mirror the
   plugin's own view for diagnosis; they are not a source of truth about host
   state, and a non-empty `degraded[]` can coexist with `mounted: true` — read
   `degraded`, not `mounted` alone.
7. With no `ctx.storageDomain`, orientation does not survive a resume: IEG
   degrades to in-memory state and re-imposes the orientation requirement. This
   is accepted, documented behaviour.
8. Log narration (`ctx.logger`) is best-effort and invisible in stock
   compositions; use the `ieg_status` diagnostic ring instead.

When reporting a *task* failure rather than a vulnerability, use the
[`.github/ISSUE_TEMPLATE/bug_report.yml`](.github/ISSUE_TEMPLATE/bug_report.yml)
issue form.

## Credential-exposure audit (P0-1)

**Result: clean.** No credential is present in the current tree or in git history, and the
current tree contains no credential-shaped file at all. No history rewrite is needed, and no
key needs to be revoked on the basis of this audit.

What was inspected, and what it showed:

| Scope | Finding |
|---|---|
| Every tracked file, scanned for token / API-key / private-key / credential-assignment patterns | **0 matches** |
| Working tree including untracked files, for `.credentials*`, `.env*`, `id_rsa*`, `*.pem`, `auth.json` | **no such file exists** |
| Git history: `--all`, every revision, every path | **1 match, and it is not a credential** (below) |
| `.ieg-e2e/` in the repository | only the two evaluation overlays, `ieg-config.yml` and `ieg-off.yml`; the throwaway home `.ieg-e2e/dsh-home/` is ignored and absent |
| `.ieg-verify/` scratch tree | present locally, gitignored, **contains no credentials file** |
| Committed `*.tgz` | none; release tarballs are built from this tree and attached to releases |
| `CHANGELOG.md` and `docs/**` | no pasted logs containing credentials |

The single historical match is a **test fixture, not a secret**: a synthetic `token` field in
a diagnostic-code fixture in `plugin/test/unit/feedback.test.js` (a retired path, added in
`6fa0c77`), sitting alongside plainly fabricated values — a fixed timestamp, `agentId:
'agent-42'`, `sessionId: 'session-7'` and a `/home/alice/…` path. Its value was redacted when
inspected and is deliberately not reproduced here. Recorded as a match so the audit does not
claim a clean scan of history that silently ignored it.

**Recurrence prevention.** `.gitignore` previously covered only `.credentials.yaml` and
`.dsh/`. It now also ignores `.env`, `.env.*`, `*.env`, `.netrc`, `auth.json`,
`credentials.json`, `service-account*.json`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`,
`id_ed25519*` and `id_ecdsa*`, so the usual credential file names cannot be committed by a
`git add -A` accident. No history was rewritten.

The evaluation workflow's cleanup assertion — `test ! -e
.ieg-e2e/dsh-home/.credentials.yaml` — is documented in `eval/README.md` and holds for the
current tree.

## The `protectedPaths` boundary (R8-03)

**`protectedPaths` is an advisory governance layer above the host sandbox. It is not a
security boundary, and IEG does not claim one.**

What it does: a target that canonicalises into a protected path is refused outright by
`tools/pre-execute`, before the configured policy is consulted, and `ctx.tools.guard`
re-asserts the same refusal monotonically. Canonicalisation is **lexical** — it unifies
separators and resolves `.` and `..` — so a detour such as `/repo/./secrets/key` or
`/repo/a/../secrets/key` is judged against the same boundary as the direct path. A root
boundary (`/`) protects everything.

What it does **not** do, stated rather than implied:

- **it does not resolve symlinks.** That needs the filesystem, and the classifier is
  synchronous because the monotonic guard is. A symlink pointing into a protected path is
  the host sandbox's concern;
- **it does not expand `~`**, which is a shell construct evaluated by the shell;
- **it cannot see through an opaque command string.** Shell tools are not classified as
  mutating tools by default, and command text is inspected heuristically: a payload
  assembled at runtime (a variable, a base64 decode, a nested interpreter) is not
  reliably classifiable from text;
- **it does not confine the filesystem.** The host's own sandbox does that, and where the
  two disagree, the host's answer is the one that takes effect.

The consequence is deliberate and matches the architecture: IEG raises the cost of an
accidental or careless write to a path the operator marked, and reports what it did.
Confidentiality and integrity against a determined adversary remain the host's
responsibility.
