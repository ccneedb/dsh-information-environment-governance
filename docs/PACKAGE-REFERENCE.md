---
doc_type: implementation-readme
project: information-environment-governance
version: 0.8.0
plugin_version: 0.12.0
status: active
owner: maintainers
last_reviewed: 2026-10-03
revision: 0.12.0-batch-7
audience: implementers + operators
language: en
---

# dsh-information-environment-governance

**Information Environment Governance (IEG)** — an additive governance layer for the
information environment an agent works in, for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This is a **verifiable prototype** of the design specified in
[`../PRODUCT-SPEC.md`](../PRODUCT-SPEC.md),
[`../ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](../ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
(notably the source-verified §17), and
[`../IMPLEMENTATION-VALIDATION-HANDOFF.md`](../IMPLEMENTATION-VALIDATION-HANDOFF.md)
(a **RETIRED** pointer; its content now lives in the architecture spec's §32 gates
and Part B).

- Package: `dsh-information-environment-governance`, version `0.9.1` (publishable,
  not published),
  MIT, **ESM**, **zero runtime dependencies**, Node `>=20`.
- CLI: `dsh-ieg` (`bin/ieg`; the interface is authored in `src/bin/ieg.ts` and
  compiled to `lib/bin/ieg.js`).
- It contributes **exactly one** additive system-prompt section (`ieg:governance`)
  and binds deterministic enforcement to verified host seams.
- The repository root **is** the package: `package.json` and `cordis.patch.yml`
  live there, with `src/**/*.ts` as the source of truth and `lib/**` as the
  committed `tsc` build output. There is no `plugin/` subdirectory.

The package has no first-party and no third-party import at runtime, so it mounts in
any composition and is immune to the profile's module-resolution layout.

## Scope

The plugin governs the **Information Environment**: the persistent information and
project constraints an agent continuously encounters, relies on, modifies, or
inherits.

There are **two governance entry points**:

1. **Project Constraint Governance** — the agent's model of the project (orientation:
   intent, scope, terminology, plan) must exist before it acts, and must stay aligned
   as the project changes.
2. **Information / Document Governance** — the information the agent reads and writes
   must not become self-contradictory, duplicated, or misleadingly stale.

**Workspace hygiene is an enforcement mechanism within the second entry point** — a
way to make document quality checkable — **not a sandbox or security system.**

**Explicitly out of scope:** general AI safety/security, sandboxing, authorization,
user-attention optimization (**RETIRED** — the capability was withdrawn in 0.7.0;
see below), and unrelated agent behavior management.

### Removed in 0.7.0: user-attention (**RETIRED history**)

The `user-attention` module and its question ledger were **removed in 0.7.0**. Their
classification is **"Out of Scope / Externally Solved"**: testing found a stable
prompt-level solution, so runtime governance of question batching is no longer
justified. This is **not** a failed feature. The removed capability — the module,
failure class `FC-2.4`, the question ledger, the batch-completeness and redundancy
gates, the `record_question` and `ieg_questions` surfaces, and the question-related
diagnostic codes — **must not appear as a current capability** anywhere.

## What it does

Three modules ship, all **default-on**, each claiming exactly one failure class:

| Module | Failure class | Problem | Runtime contribution |
|---|---|---|---|
| `project-governance` | FC-2.1 | the agent advances without a stable project model | orientation store + the `record_orientation` tool + a gate that can refuse the first mutation until orientation is declared |
| `information-integrity` | FC-2.3 | known-invalid information stays reusable | status model; promotion to authoritative requires evidence or user confirmation; the prompt requires removing or superseding outdated content |
| `workspace-governance` | FC-2.2 | unauthorized or redundant persistent mutation | `tools/pre-execute` gate + monotonic `ctx.tools.guard` backstop + a document-overlap gate; shell writes are classified from command text (quoted text is data) |

`FC-2.4` no longer exists. Every failure class from `FC-2.1` to `FC-2.3` is claimed by
exactly one module through the `addresses` field each module declares, and the
conformance suite fails if a class is claimed twice or left unclaimed.

## Seam map

```text
system prompt     -> ctx.systemPrompt.section()          advisory   (never `complete`)
step admission    -> agent/pre-step                      veto       ({kind:'reject'})
orientation tool  -> record_orientation (registered)     capture    (intent, scope, terms, plan)
orientation gate  -> tools/pre-execute                   deny       (until orientation recorded)
mutation gate     -> tools/pre-execute                   gate       ({kind:'ask'|'deny'})
overlap gate      -> ctx.fs scan + tools/pre-execute     gate       (duplicate new document)
mutation backstop -> ctx.tools.guard()                   deny only  (monotonic)
status line       -> ctx.systemPrompt.context()          advisory   (`ieg:status`, runtime context)
diagnostics tool  -> ieg_status (registered)             read-only  (mount, config, verdict, ring)
prompt CLI        -> dsh-ieg prompt | prompt edit        operator   (no install surface; Batch 5)
maintenance round -> maintain_environment (registered)   read-only  (inventory, diagnosis, proposals)
compatibility     -> host section inventory + hashes     report     (COMPATIBLE | … | UNSUPPORTED)
```

## Model-facing surface

Exactly **two** tools are registered:

| Tool | Direction | Purpose |
|---|---|---|
| `record_orientation` | capture | record intent, scope, terminology, and a task-flow plan |
| `maintain_environment` | read-only | one maintenance round: inventory, diagnosis and proposed actions for the information environment; optionally reconciles one named change |
| `ieg_status` | read-only | mount record, effective configuration, compatibility verdict, and the diagnostic ring |

The plugin also contributes one runtime-context line, **`ieg:status`**, which reports
the mount, the active modules, the last denial, the agent id, and the compatibility
verdict without requiring a logger exporter.

Diagnostics use the **`ieg.*`** namespace. The vocabulary covers mount and capability
state (`ieg.mount`, `ieg.capability_missing`, `ieg.config_invalid`, `ieg.error`),
host compatibility (`ieg.host_compatibility`), modules (`ieg.module_enabled`,
`ieg.module_conflict`), orientation (`ieg.orientation_recorded`,
`ieg.orientation_required`, `ieg.orientation_restored`), information integrity
(`ieg.information_invalidated`, `ieg.information_reintroduced`), workspace governance
(`ieg.workspace_mutation_allowed`, `ieg.workspace_mutation_blocked`,
`ieg.document_overlap_flagged`), prompt assembly (`ieg.prompt_assembly`,
`ieg.prompt_override_applied`, `ieg.prompt_override_rejected`,
`ieg.prompt_override_missing`), and the diagnostics mirror
(`ieg.diagnostics_export_failed`), and the maintenance round
(`ieg.maintenance_round`, `ieg.maintenance_due`). Batch 5 removed the five
`ieg.control_*` codes
along with the control plane they described.

**Durable state** is stored through `ctx.storageDomain` under domain
**`ieg_governance`**, `DOMAIN_VERSION` **1**.

## Prompt section and budget

One section, **`ieg:governance`**, is contributed at order **8500** (verified host
fact: DSH exposes no plugin-allocatable placement, so IEG names a finite order
itself). It is registered with `interpolate: false` and **`complete` is never set** —
the plugin adds text and never claims the section is complete.

| Property | Value |
|---|---|
| `PROMPT_VERSION` | `0.3.0` |
| Compiled section size | **2,806 bytes** |
| Recorded ceiling | **2,945 bytes** |
| Floor | 1400 bytes |
| Hard cap | 4096 bytes |

The compiled text is **generated and audited** by an executable conformance suite
(`test/unit/prompt-conformance.test.js`): every `FC-2.1` … `FC-2.3` class is claimed
exactly once; no statement appears twice; each module states at least one trigger
condition; no prompt text claims authority over the user or host or leaks
implementation detail; and the byte ceiling is recorded so prompt cost cannot drift
silently.

### Prompt modes and precedence

`prompt.mode` lets a deployment change the text on its own terms:

| Mode | Effect |
|---|---|
| `compiled` (default) | the audited generated section, unchanged |
| `append` | the compiled section plus `prompt.append` |
| `replace` | `prompt.file` becomes the section verbatim |

Two requirements are enforced on any override because they are mechanisms rather than
style: no `{{ }}` interpolation syntax, and the byte ceiling unless
`prompt.allowOverBudget: true` is set deliberately. A refused edit **keeps the
compiled default and says why** (`ieg.prompt_override_rejected` /
`ieg.prompt_override_missing`) — it never mounts inert and never silently ignores the
text. An applied edit is versioned `PROMPT_VERSION+user:<hash>` so a behavioural claim
still names one text; the conformance invariants that cannot be checked on arbitrary
text are reported as `promptUnchecked` with `ieg.prompt_override_applied`, so a
user-edited prompt is never presented as an audited one.

Precedence for the effective text is:

```text
control-plane prompt.md                                 (highest)
  > config prompt.file   (only when prompt.mode: replace)
  > config prompt.append (only when prompt.mode: append)
  > the compiled default                                (lowest)
```

## Configuration

All configuration lives on the single composition row inserted by
[`../cordis.patch.yml`](../cordis.patch.yml). A patch replaces the whole `config` of a row,
so an override restates the fields it needs.

```yaml
- id: ieg
  config:
    enabled: true
    sectionOrder: 8500            # no host-allocated slot exists; this is explicit
    modules:                      # all three ship default-on
      project-governance:   { enabled: true }
      information-integrity: { enabled: true }
      workspace-governance:  { enabled: true }
    workspace:
      policy: ask                 # allow | ask | deny
      mutatingTools:              # file-effect tools only
        - write
        - edit
        - str_replace_editor
      protectedPaths: []          # always denied, even under `policy: allow`
      overlapCheck: ask           # off | ask | deny — new document duplicating an existing one
      classifyShellCommands: true # govern shell writes, which the tool list cannot see
    preStep:
      orientationGate: off        # off | warn | reject  (blocks the step itself)
      requireBeforeMutation: false # opt-in; true refuses the first write
    prompt:
      mode: compiled              # compiled | append | replace
      append: ""                  # extra guidance, appended to the compiled section
      file: ""                    # markdown file, used when mode is `replace`
      allowOverBudget: false      # accept text over the ceiling, deliberately
    diagnostics: true             # master switch for the diagnostic ring
    diagnosticsExport:
      file: ""                    # empty = off; no file I/O unless configured
      limit: 50                   # 1..200
```

Top-level keys are exactly `enabled`, `sectionOrder`, `modules`, `workspace`,
`preStep`, `prompt`, `diagnostics`, and `diagnosticsExport`. Any other key is
rejected.

> **`userAttention` is removed.** The key no longer exists. Supplying it is an
> **unknown-key configuration error**: IEG rejects the whole configuration and mounts
> its observable fault surface (`mounted: false`, `ieg.config_invalid`) instead of
> silently ignoring the field. It is not accepted as a no-op.

Defaults are non-intrusive: `requireBeforeMutation` is `false` and the orientation gate
is `off`, so IEG does not deny the first write of a session unless a deployment opts
in. Strict mode is one configuration change.

### Shell-write classification

Shell tools are deliberately absent from `mutatingTools`, so `ls`, `grep`, and
`node --test` are never gated. The coverage hole that exclusion left — a document
created by a redirection, or removed with `rm`, without any file-effect tool call — is
closed by `workspace.classifyShellCommands`, which inspects the command text and treats
only a command that can write as a mutation. Quoted text is data unless the command
wraps another command, so `rg '=>' src` and `git commit -m 'rm stale files'` stay
read-only while `bash -c 'rm -rf build'` does not. Two residual limits are pinned by
tests rather than hidden: a wrapper invoked indirectly (`env bash -c '…'`) and
PowerShell `Remove-Item` are not recognised as writes.

## Mount resilience

`apply()` never throws (`ARCHITECTURE-SPEC` §26.2). The host reports a throwing entry as
`warning: N entry did not activate` and carries on, so a fault must degrade into
something the transcript can show rather than into a silent absence:

- a **configuration fault** mounts an inert but observable surface — the read-only
  `ieg_status` tool and the `ieg:status` line report `mounted: false` with the
  validator's message and an `ieg.config_invalid` diagnostic, and **no** prompt section
  or enforcement is registered (fail-safe, never wrong enforcement);
- each capability registers in its **own guarded step**, so one unavailable seam costs
  only that seam, and the failure is attributed in the diagnostic ring;
- an **absent** seam is recorded as `ieg.capability_missing` and listed in the mount
  record's `degraded[]`, so "IEG is present but incomplete" is distinguishable from
  "IEG is complete" — read `degraded`, not `mounted` alone;
- **log narration is best-effort**: a logger that throws cannot unmount IEG, because
  the ring, the status line, and the tools carry the state.

## Control plane and CLI

The supported interface is a terminal command, `dsh-ieg`, run from a Debian shell.
The command is a **prompt CLI**. Batch 5 removed the interactive menu, the
`start | pause | restart | exit` control plane and the npm installation lifecycle
(`install | update | uninstall`): a plugin cannot install itself, and the host already
owns installation. What remains is small enough to state completely.

```text
dsh-ieg prompt         # print the effective prompt, its version and byte count
dsh-ieg prompt edit    # $EDITOR on a temp copy; validate; store prompt.md
dsh-ieg --help | --version
```

There are no flags beyond those: no `--state`, `--json`, `--profile`, `--from`,
`--home`, `--yes` or `--dry-run`. Parsing and the `$EDITOR` invocation are hand-rolled
over Node builtins, so the package keeps its zero-runtime-dependency property.

**`prompt.md`.** Prompt text lives in its own file, at **`$IEG_PROMPT_FILE`**, else
`<state-dir>/ieg/prompt.md` where `<state-dir>` = `$XDG_STATE_HOME` or
`~/.local/state`; `resolvePromptPath()` is the whole location policy. `dsh-ieg prompt`
prints the effective text with its version and byte count; `dsh-ieg prompt edit` opens
`$EDITOR` on a temporary copy and stores the result only after the same validation the
plugin applies. Nothing in the package deletes the file: to return to the compiled
default, remove it by hand.

## Installation

### Installation is the host's job

Batch 5 removed IEG's own installation lifecycle (`dsh-ieg install | update |
uninstall`) together with its POSIX wrapper and the npm-only uninstall scaffolding.
A plugin cannot install itself, and DSH already owns this:

```bash
dsh plugin --profile ieg-test add <registry-name|absolute-path|git-address|tarball>
```

Exactly two official entry paths exist — `dsh-market` and DSH's native plugin
installation — and an update is deliberately "remove the old installation, install
the new one". Registering the package in `dsh.profile.bundles` is the host's plugin
manager's job; IEG no longer performs it and no IEG-specific mechanism replaces it.

`dsh-ieg` remains, reduced to the prompt surface (`prompt` and `prompt edit`).

### Environment variables

| Variable | Purpose |
|---|---|
| `IEG_STATE_FILE` | overrides the control-state path (the sibling `prompt.md` sits beside it) |
| `IEG_DSH_PACKAGES` | the installed DSH package directory the tests and `verify.sh` load host services from |
| `IEG_VERIFY_HOME` | the throwaway DSH home `scripts/verify.sh` uses; a temporary `.ieg-verify/` under the repository by default |

### npm registry publication

**Not authorised.** The package is publishable but is not published to the npm
registry; `npm install <name>` from a registry therefore does not work today.
Distribution is the release tarball (or a clone). `npm pack` remains the canonical
artifact producer, and the release workflow builds and attaches that tarball. Removing
`private` and choosing a publish target are release decisions withheld until the
model-backed gates pass (`ARCHITECTURE-SPEC` §31.1, §34.2 Q5).

## Verification

```bash
npm run build         # src/**/*.ts -> lib (the artifacts the host loads)
npm test              # node --test (unit + conformance + integration)
./scripts/verify.sh   # the full evidence chain, real profile install
```

`npm test` runs several layers:

- **Unit** — config validation, module contract and dependency resolution, prompt
  compilation and budget, and the pure logic of all three modules.
- **Conformance** — the injected prompt text audited against the content rules, the
  dedupe rule, failure-class coverage `FC-2.1` … `FC-2.3`, and the recorded byte
  ceiling.
- **Integration** — boots the **real** `@deepseek-ai/dsh-system-prompt`,
  `@deepseek-ai/dsh-tools`, and `@deepseek-ai/dsh-fs-local` from the installed
  distribution and asserts the section renders additively, the host prompt survives,
  the orientation tool registers and is refused-then-admitted, the mutation gate
  denies, the guard denies independently, `ask` fails closed, a real duplicate
  document is caught through the real filesystem, two live agents never share
  governance state, and the gate-precision matrix measures `false_block_rate = 0`
  over its legitimate corpus.
- **Mount resilience** — an invalid configuration does not throw and stays observable,
  one failing capability does not lose the others, `degraded[]` distinguishes a partial
  mount, an absent seam is recorded, a broken logger cannot break the mount, and the
  durable handle is disposed through `ctx.effect`.

`scripts/verify.sh` adds the packaging and load evidence chain against a throwaway
`DSH_HOME` (`$IEG_VERIFY_HOME`, default `.ieg-verify/` inside the repository), so your
real profile is never touched. Its execution proof runs against the profile's **own
installed copy** of the package (a real directory, not a link back to the source tree):
the installed artifact must bind one `ieg:governance` section and its tools, must absorb
a bad configuration into that observable fault surface, and the host must then boot the
real composition carrying the bad overlay without reporting an unactivated entry.

Behavioural effect is measured separately by the sandbox harness in
[`../eval/`](../eval/README.md), which is not part of `npm test` because it runs real
agents rather than assertions.

## Acceptance gates

The implementation is tracked against ten gates, labelled **A** through **J** with no
gaps:

| Gate | Subject | Status |
|---|---|---|
| A | host compatibility | met |
| B | semantic non-conflict | met |
| C | behavioural improvement | **unmet — no current measurement** |
| D | information integrity | **unmet — no current measurement** |
| E | regression resilience | met |
| F | diagnosability | met |
| G | agent isolation | met |
| H | compatibility baseline | met |
| I | packaging | partial |
| J | withdrawal integrity | met |

## Not verified by this prototype

Honest boundaries:

- **`agent/pre-step` live dispatch.** The handler's wiring, arity, and decision shape
  are tested; executing it against a live agent loop requires a full session/LLM
  composition and is left to the handoff's build phases.
- **Behavioural improvement (Gate C) and information integrity (Gate D).** **Unmeasured
  for the current revision.** Every earlier trial was run against a previous prompt
  revision, which no longer exists; that evidence was deleted as superseded rather than
  kept beside results for different text. The next `eval/e2e.mjs` run against this
  plugin is what produces a valid number. See [`../eval/README.md`](../eval/README.md).
- **Host baseline range.** The single supported baseline is `dsh 0.2.1-alpha.1`: the
  declared range is `dsh >=0.2.1-alpha.1 <0.3.0`, and
  `dsh.compatibility.dshReleases` lists that one release as `verified`. The retired
  `0.2.0-rc.2` baseline is **SUPERSEDED**: it is no longer in the peer range or the
  release map, and the committed baseline was re-captured against the installed
  `0.2.1-alpha.1` host (identical section order and host prompt hash `ceb63ee5`).
  There is no legacy compatibility layer; the adapter observes seam facts against
  the committed baseline rather than branching on a version string.
- **Packaging (Gate I) is partial.** The package is publishable but is not
  published to a registry; only the GitHub release tarball is a supported channel.
