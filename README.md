---
doc_type: readme
project: information-environment-governance
version: 0.5.0
plugin_version: 0.12.1
status: active
owner: maintainers
last_reviewed: 2026-10-03
revision: 0.12.1-batch-7
verified_against: dsh-v0.2.1-alpha.1
language: en
format_note: conservative-machine-readable-markdown
---

# Information Environment Governance (IEG)

Status: prototype, paused (maintenance-only). Used only by its author so far. Not published to npm.

[![CI](https://github.com/ccneedb/dsh-information-environment-governance/actions/workflows/ci.yml/badge.svg)](https://github.com/ccneedb/dsh-information-environment-governance/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status: prototype](https://img.shields.io/badge/status-prototype-orange.svg)](#status)

**IEG is an additive project-governance layer for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).** It
governs the *information environment* an agent works in. The canonical
definition of that term, the full positioning, and the authoritative scope live
in [`PRODUCT-SPEC.md` §1](PRODUCT-SPEC.md#1-product-positioning); this README
links there rather than restating them.

> **Status: prototype, not production-ready.** The package is
> `dsh-information-environment-governance` **0.12.1** — publishable and verified
> but **not published** — and the
> publish target is undecided. Behavioural improvement (Gate C) and information
> integrity (Gate D) have no valid measurement for the current prompt revision
> and packaging (Gate I) is partial. It is not recommended for a working
> profile. Current numbers are in
> [`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3–§4; see [Status](#status).

## At a glance

**What is it?** Information Environment Governance for DSH coding agents: one
additive prompt section plus deterministic runtime gates, shipped as the
`dsh-information-environment-governance` plugin. It is not a replacement system
prompt, a second agent identity, a generic prompt improver, or a general safety
layer.

**What does it govern?**

- project constraints;
- information / document lifecycle and integrity;
- workspace hygiene, where it directly supports the information environment.

**What does it not govern?**

- general AI safety / security;
- sandboxing;
- authorization;
- user-attention optimization.

**Who is it for?** Users who rely on coding agents for professional work without
necessarily having a full software-engineering background.

### The product message

> **The goal is not to make the agent "more intelligent"; it is to keep the
> project environment clearer, more consistent, and easier for the agent and user
> to understand over time.**

This is an **intended benefit, not a guarantee** of reliability or of superior
model capability. The practical problem is a project quietly turning into
something neither the agent nor the user can reason about any more — the
"unmaintainable pile" that starts as a few convenient files. Even when the user's
understanding of the project direction becomes unclear, a well-maintained project
environment gives the agent a cleaner basis for reconstructing project context.

## 中文说明

**信息环境治理（Information Environment Governance，简称 IEG）** 是为
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的编码智能体提供的一层
**附加**治理。它治理的是智能体所处的**信息环境**（Information Environment）：
智能体在项目中持续接触、依赖、修改或继承的持久化信息与项目约束。

**治理什么**

- 项目约束：目标、范围、术语、约束、当前阶段；
- 信息与文档的生命周期与完整性：存在性、状态、权威性、来源、替代关系、可检索性；
- 工作区整洁（workspace hygiene）——仅限直接支撑信息环境的部分。

**不治理什么**

- 通用的 AI 安全 / 安全防护；
- 沙箱（sandboxing）；
- 授权（authorization）；
- 用户注意力优化（user-attention optimization）。

**面向谁**：把编码智能体用于专业工作的用户，不要求具备完整的软件工程背景。

**核心信息**：目标不是让智能体“更聪明”，而是让项目环境随时间保持**更清晰、更一致**，
更容易被智能体和用户理解。这是**期望收益，不是可靠性保证**。

> 即使项目方向的把握变得模糊，一个维护良好的项目环境也能为智能体重建项目上下文
> 提供更干净的基础。

本项目的**工作语言与权威文档为英文**，本节仅为面向中文读者的简要说明；术语与产品边界
以英文文档为准（[`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) §1）。

## Contents

This repository is the project documentation **and** the working prototype of the
plugin.

| Document | Audience | Purpose |
|---|---|---|
| `PRODUCT-SPEC.md` | humans + agents | positioning, the canonical definition and scope, the two governance entry points, goals, requirements, success criteria — the single source of truth for what IEG is |
| `ARCHITECTURE-SPEC-AGENT-REFERENCE.md` | implementation agents | architecture, module contracts, diagrams, runtime integration, compatibility model. **Part A** is the source-verified host integration, its deltas, and residual assumptions. **Part B** is the target design, the acceptance matrix (**§32**), and the phase plan |
| `MAINTENANCE-HANDOFF.md` | maintainers | the maintained status record: current status and numbers (**§3–§4**, the single source of truth), blockers, backlog, process gotchas, workspace layout, and the naming/withdrawal history |
| `TESTING.md` | volunteers | the volunteer procedure: install, first trial, the A/B check, and deviation reporting |
| `SECURITY.md` | everyone | what IEG is not, the accepted limits (single source of truth), the out-of-scope list, and how to report a vulnerability |
| `CONTRIBUTING.md` | contributors | prerequisites, the checks to run (single source of truth), and the project rules |
| `IMPLEMENTATION-VALIDATION-HANDOFF.md` | agents | retired — a pointer to the §32 gates and the historical build order |
| `docs/DOCUMENTATION-INDEX.md` | everyone | the document inventory and the single-source-of-truth map |
| `.github/ISSUE_TEMPLATE/` | users + maintainers | the bug-report and feature-request forms a deviation report uses |
| repository root (`package.json`, `cordis.patch.yml`, `src/`, `lib/`, `bin/ieg`) | implementation agents | the working `dsh-information-environment-governance` package: manifest, kernel, three modules, the `dsh-ieg` terminal interface, and the verification chain. **The root *is* the package** — there is no `plugin/` subdirectory |
| `eval/` | evaluation agents | behavioural and end-to-end evaluation: the harness, the seeded scenarios, and the sandbox runs |

## What IEG governs

IEG has **two governance entry points**:

1. **Project Constraint Governance** — keeps the project's objective, scope
   terminology, constraints, and current phase explicit, and distinguishes
   *declared understanding* from *actual behavioral consistency*.
2. **Information / Document Governance** — keeps the state of project
   information explicit (existence, status, authority, provenance
   supersession, retrieval eligibility) and governs the documents that carry
   it. Workspace hygiene is an **enforcement mechanism inside this entry
   point**, not a separate system.

Three primary areas are in scope:

1. **Project Constraints** — objective, scope, terminology, constraints
   current phase.
2. **Information State** — authority, validity, provenance, supersession
   lifecycle status.
3. **Persistent Workspace** — documents, artifacts, source/configuration, and
   generated files.

### Explicitly out of scope

The following are **not** IEG's concern, and no future feature may drift into
them:

- general AI safety or security;
- sandboxing;
- authorization;
- user-attention optimization (**RETIRED** — the capability was withdrawn in 0.7.0;
  see the history in [`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §13.2);
- unrelated agent behavior management.

Any future feature must show a direct connection to Information Environment
Governance. The authoritative statement of this boundary is
[`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) §1 and §4; the security consequences are in
[`SECURITY.md`](SECURITY.md).

### Modules (3, all enabled by default)

| Module | Failure class | Concern |
|---|---|---|
| `project-governance` | `FC-2.1` | project orientation, scope, terminology, and constraint drift |
| `information-integrity` | `FC-2.3` | reuse of known-invalid or superseded information |
| `workspace-governance` | `FC-2.2` | unauthorized persistent workspace mutation |

The former `user-attention` module and failure class `FC-2.4` were **removed in
0.7.0** and are classified **"Out of Scope / Externally Solved"**. They are not
a current capability; the withdrawal is recorded as history in
[`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) and
[`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
Part B.

## Interface: the `dsh-ieg` terminal command

The supported interface is a terminal command, `dsh-ieg`, run from a Debian
shell. Running it with no arguments prints its usage; every command also works
non-interactively with flags, because CI and scripts call it. The
entry file is [`bin/ieg`](bin/ieg).

```text
dsh-ieg                      # usage (there is no interactive menu)
dsh-ieg prompt               # print the effective prompt, its version and byte count
dsh-ieg prompt edit          # $EDITOR on a temp copy of the effective text; validate; store
dsh-ieg --help / --version
```

There is **no installation, update, uninstall or lifecycle surface** here: a
plugin cannot install itself, so §Install carries the only two official entry
paths. Batch 5 removed the former `install`/`update`/`uninstall` commands, the
`start`/`pause`/`restart`/`exit` control plane and the interactive menu, so `prompt`
management is the whole interface — use `enabled: false` in the row config to turn
governance off for a profile.

The prompt text lives in `prompt.md`, at `$IEG_PROMPT_FILE`, else
`<state-dir>/ieg/prompt.md` where `<state-dir>` is `$XDG_STATE_HOME` else
`~/.local/state`. Every candidate is validated through the same kernel the plugin
uses for a config-supplied override (no `{{ }}`, byte ceiling unless
`allowOverBudget`; a refusal keeps the previous text and prints its reasons), and
it is re-resolved on each assembly, so an edit applies without a remount.
Precedence is the operator `prompt.md` > config `prompt.file` (when
`prompt.mode: replace`) > `prompt.append` > the compiled default.

The plugin contributes **one** additive prompt section, `ieg:governance`
(`order: 8500`, `interpolate: false`, `complete` never set) and **six** tools —
`record_orientation`, `record_information`, `confirm_terminology` and
`confirm_information`, plus the read-only `ieg_status` and `maintain_environment`.
The two confirmations are gated through the host's approval service, so the model
cannot supply the user's authority itself. At `PROMPT_VERSION`
0.5.0 the compiled section is **2,806 bytes** against a **2,945-byte** ceiling.
It reports its own state through the `ieg:status` runtime-context line and the
`ieg.*` diagnostic codes. Full runtime detail is in
[`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
Part B.

## Terminology governance

IEG keeps a **project-local glossary** as persistent project state: `canonicalTerm`,
`definition`, `aliases[]`, `status` (`PROVISIONAL | CONFIRMED | DEPRECATED |
CONFLICTED`), `source`, `scope`, `confirmedByUser`, `confidence` and `supersedes[]`.
Terms captured during orientation enter as **provisional and inferred**; only an
explicit user statement makes a term confirmed.

It is semantic alignment, not language policing: a harmless alias is accepted
silently, an ambiguity is surfaced, and a conflict is reported rather than resolved
by choosing a meaning. The precedence model and its invariant — *an inferred entry
never becomes unquestionable authority merely by being persisted* — are in
[`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3.

## Maintenance round

IEG also **maintains** the environment rather than only gating actions. One
manually triggerable round, `maintain_environment`, inventories the workspace's
persistent artifacts (authoritative specifications, implementation documentation
configuration, working notes, generated, historical, temporary and unknown)
diagnoses duplication, obsolescence and declared drift, and returns proposed actions
from a fixed vocabulary — `KEEP | MERGE | UPDATE | REPLACE | DEPRECATE | REMOVE |
LEAVE_UNCHANGED | REQUIRES_REVIEW` — each with a reason and a confidence.

**It proposes; it never applies.** The tool is read-only by construction, and every
destructive proposal needs an explicit human decision. Point it at a specific change
with `changed` and it also reconciles: which other artifacts mention that subject
which of their stated facts have gone stale, and what it could not settle.

The runtime counts **direct user instruction batches** using the host's own turn
accounting; internal steps, tool calls and generated context are excluded by
construction. At seven it marks maintenance due in the runtime context and the
round resets the counter.

What is **not** implemented is stated in
[`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3 — notably cross-document
contradiction detection beyond declared state, which is listed as a future
capability rather than a claim.

## Install

IEG is a **DSH plugin**. It is installed by the host's own plugin installer and
only afterwards managed by `dsh-ieg`. Those are two separate steps: **`dsh-ieg`
is supplied by the package itself**, so it cannot bootstrap the package. On a
clean machine a bare `dsh-ieg` is simply not on your `PATH`:

```console
$ dsh-ieg prompt
bash: dsh-ieg: command not found
```

Install into a **throwaway** profile, never into a profile you rely on.

### 1. Standard install — DSH-native (recommended)

DSH installs a plugin from a registry package name, an absolute path, a git
address, or a tarball. That is the first-install path:

```bash
# from the repository (the repository root IS the package)
dsh plugin --profile <your-test-profile> add \
  https://github.com/ccneedb/dsh-information-environment-governance

# confirm the bundle row composed
dsh --profile <your-test-profile> --dump-config | grep -A3 'id: ieg'
```

The DSH Web UI's plugin installation offers the same repository-URL path through
its "Git repository" field — the graphical form of the same mechanism.

### 2. npm package

The package is **publishable and verified, not yet published**. The registry name
`dsh-information-environment-governance` is currently unclaimed, so a first
publication is a maintainer action, still withheld pending Gates C and D and the
publish-target decision ([Status](#status)). Until then, `npm install` from the
registry does not resolve; build and install the exact artifact locally:

```bash
npm pack                        # builds exactly what npm would publish
dsh plugin --profile <your-test-profile> add \
  "file:./dsh-information-environment-governance-<version>.tgz"
```

The packed artifact carries exactly the runtime — `lib/**`, `bin/ieg`
`cordis.patch.yml`, `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md` — and
none of `src/`, `test/`, `eval/`, `docs/`. Package-level configuration detail is
in [`docs/PACKAGE-REFERENCE.md`](docs/PACKAGE-REFERENCE.md).

### 3. Development and recovery

For working on IEG itself, or recovering a profile:

```bash
dsh plugin --profile <your-test-profile> add "file:/path/to/this/repository"   # a checkout
dsh plugin --profile <your-test-profile> remove dsh-information-environment-governance
```

A release tarball is attached to the
[GitHub release](https://github.com/ccneedb/dsh-information-environment-governance/releases);
it is a developer/recovery source, not the normal user path.

### The `dsh-ieg` prompt CLI

`dsh-ieg` manages the **prompt** of an already installed IEG — nothing else. pnpm
installs it into the profile beside the package rather than onto your `PATH`, so
the dependable invocation is the profile-local binary:

```bash
<DSH_HOME>/profiles/<your-test-profile>/node_modules/.bin/dsh-ieg prompt
```

For a stable command, install the package globally with npm
(`npm install -g dsh-information-environment-governance`, once published) or call
it through `npx dsh-ieg …`. It has two commands: `prompt` (view the effective
text, its version and byte count) and `prompt edit` (validate an edited copy and
store it). It never installs anything.

### Upgrading

A normal upgrade re-runs the host's own install for the profile; that is what
re-resolves and re-links the package, and `dsh-ieg` is not involved:

```bash
dsh plugin --profile <your-test-profile> add <the same source you installed from>
dsh --profile <your-test-profile> --dump-config | grep -A3 'id: ieg'      # still composes
<DSH_HOME>/profiles/<your-test-profile>/node_modules/.bin/dsh-ieg prompt  # the effective text
```

First install, upgrade and developer/recovery all use the same DSH-native
command; only the *source* changes (repository URL, registry name, checkout, or
tarball).

Two caveats worth knowing before first use:

- a profile **links the plugin at install time**, so re-install after any source
  change or you will exercise the old code;
- IEG defaults to `workspace.policy: ask` and `overlapCheck: ask`, which **fail
  closed** in a composition with no approval channel. In a headless or
  agent-delegated session there is no one to answer, so the gate denies writes —
  see [`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §7. For a first trial
  prefer `workspace: { policy: allow, overlapCheck: ask, protectedPaths: [...] }`
  and keep the non-intrusive `requireBeforeMutation: false` default.

Requirements: **Debian/Linux** (the supported environment), Node.js >= 20 and a
DeepSeek Harness installation. Shell governance targets Bash; PowerShell and other
platforms are explicitly unsupported. The declared
peer range is `>=0.2.1-alpha.1 <0.3.0`, and `dsh.compatibility.dshReleases`
records that single baseline as `verified`; the committed baseline was
re-captured against the installed `0.2.1-alpha.1` host in 0.8.0 (identical section
order and host prompt hash). The retired `0.2.0-rc.2` baseline is **SUPERSEDED**
and is no longer in the range or the release map. Note that the declared range is
a **compatibility statement, not a tested-versions list**: exactly one release
`0.2.1-alpha.1`, is verified. See
[`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3–§4.

### Volunteer testing

The behavioural gates cannot be measured without real sessions, so volunteers are
the bottleneck for this project. The volunteer procedure — a throwaway profile, a
first-trial configuration, an A/B check, and what to capture in a deviation
report — is maintained once in [`TESTING.md`](TESTING.md). The plugin list in a
running app shows the bundles of the profile that app **runs**, so installing
into `ieg-test` while your app runs `web` looks exactly like a failed install;
[`scripts/check-install.sh`](scripts/check-install.sh) checks the profile end to
end and prints which situation you are in.

## Repository layout

```text
README.md                             this file
PRODUCT-SPEC.md                       positioning, scope, goals, success criteria
ARCHITECTURE-SPEC-AGENT-REFERENCE.md  architecture; Part A verified host seams
                                      Part B the target design and the §32 gates
IMPLEMENTATION-VALIDATION-HANDOFF.md  retired pointer to §32 and the build order
MAINTENANCE-HANDOFF.md                current status and numbers; maintenance gotchas
TESTING.md                            volunteer install, first trial, and deviation reporting
SECURITY.md                           boundaries, accepted limits, and reporting
CONTRIBUTING.md                       prerequisites, checks, and the project rules
CODE_OF_CONDUCT.md                    Contributor Covenant 2.1
LICENSE                               MIT
docs/                                 the documentation index and single-source-of-truth map
scripts/                              repository tooling (check-install.sh, check-docs.sh, verify.sh)
package.json / cordis.patch.yml       the DSH bundle manifest and patch (the root is the package)
src/                                  the TypeScript source of truth for the runtime
lib/                                  the compiled runtime `tsc` emits from src/ (committed)
bin/ieg                               the `dsh-ieg` executable shim
test/ test-support/                   unit, conformance, and integration suites
eval/                                 the behavioural evaluation harness
.github/                              CI, issue forms, and the pull-request template
```

Document front matter carries `doc_type`, `owner`, `last_reviewed`, and `status`.
`version` is that document's **own** revision — it tracks the document, not the
package — and `plugin_version`, where present, names the package version the
record describes. The rule is stated once, with the full inventory and the
single-source-of-truth map, in
[`docs/DOCUMENTATION-INDEX.md`](docs/DOCUMENTATION-INDEX.md).

## Development

Prerequisites, the checks to run (`typecheck`, `npm test`, `verify.sh`
`check-docs.sh`), and the rules that keep the project maintainable are maintained
once in [`CONTRIBUTING.md`](CONTRIBUTING.md) §Running the checks. Integration
tests mount the **real** host services; they skip (rather than fail) when no DSH
installation is present. Point the loader at a non-default install with
`IEG_DSH_PACKAGES`; the verification chain honours `IEG_VERIFY_HOME`. Read
[`SECURITY.md`](SECURITY.md) before reporting anything.

## Working prototype

The repository root **is** an installable **`dsh-information-environment-governance`**
`0.12.1` (publishable and verified, **not published**) that realizes the architecture above
with zero runtime dependencies. It contributes one additive prompt section and
enforces through `agent/pre-step`, `tools/pre-execute`, `ctx.tools.guard`, and
`ctx.storageDomain`; it reports its own state through a bounded runtime-context
status line plus the `record_orientation` and read-only `ieg_status` tools; and
it ships the `dsh-ieg` terminal interface for control
and a `prompt` / `prompt edit` command for `prompt.md`.
The runtime is authored in TypeScript under `src/**`; `lib/**` is its committed
`tsc` build output (see
[`TYPESCRIPT-MIGRATION.md`](TYPESCRIPT-MIGRATION.md)).

The evidence chain — run per [`CONTRIBUTING.md`](CONTRIBUTING.md) §Running the
checks — covers strict typechecking, the full test suite (all pass, no todo and no skip; the
current count is reported in [`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3; unit
prompt conformance, and integration mounting the **real** `dsh-system-prompt`
`dsh-tools`, `dsh-fs-local`, and the
`dsh-storage`/`dsh-storage-json`/`dsh-storage-domain` stack) and the **24 checks**
of [`scripts/verify.sh`](scripts/verify.sh): a real install into
a throwaway profile, composition of the `ieg` row, and positive proof that the
**installed** plugin binds its section, listeners, and tools — and absorbs a bad
configuration observably instead of unmounting. Current counts are in
[`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3. See
[`docs/PACKAGE-REFERENCE.md`](docs/PACKAGE-REFERENCE.md) for the honest list of what it does not yet
verify.

Behavioural effect is measured separately by the sandbox harness in
[`eval/`](eval/README.md), which runs real agent trials with and without the
governance section. **No valid measurement exists for the current prompt
revision:** earlier trials were run against withdrawn prompt revisions and were
deleted as superseded, so `eval/README.md` records the method and the pending
re-run rather than superseded numbers.

## Status

**Prototype. Not production-ready.**

1. **Gates C and D are unmeasured** for the current three-module prompt — **no
   behavioural claim is made** — and **Gate I
   (packaging) is partial**. Gate C needs a model-backed run of
   [`eval/`](eval/README.md) with a rubric frozen beforehand and a judge that
   does not see the arm. Gate D needs the same kind of run for information
   integrity. Superseded measurements were deleted, not annotated, because a
   stale number still reads as a standing result.
2. **Decisions are open**, consolidated in
   [`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §9: the publish target, any
   live-profile rollout, and the control state file being per-user rather than
   per-profile (Q8). The compatibility-baseline re-capture (Q7) closed in 0.8.0:
   the single supported baseline is `dsh 0.2.1-alpha.1`.
3. **The package is publishable but not published.** `private` is gone, the packed
   artifact has been verified from a clean profile, and the registry name is
   unclaimed; publication itself is the release action, withheld until 1 and 2 are
   resolved.

The current version, test count, verification result, and the per-gate status are
maintained once in [`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3–§4, with
the gate table in
[`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
§32.1.

## Reporting a task failure

A deviation report is an **ordinary GitHub issue**. Use the repository's
[`.github/ISSUE_TEMPLATE/bug_report.yml`](.github/ISSUE_TEMPLATE/bug_report.yml)
form (or [`feature_request.yml`](.github/ISSUE_TEMPLATE/feature_request.yml) for a
capability request) — see [`TESTING.md`](TESTING.md) §6 for what to put in it.

The most important step is the A/B check: ask the agent to call `ieg_status`, then
run the same task with IEG disabled (`enabled: false`;
[`TESTING.md`](TESTING.md) §4 shows the correct way). That separates an IEG
defect from a host or model defect — which is also exactly the measurement Gates
C and D need.

## Canonical architectural statement

> **IEG is an additive project-governance layer for DSH. Its stable behavioral policy is contributed through one system-prompt section; stateful and deterministic controls use appropriate DSH runtime seams.**

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for prerequisites, the checks to run
and the rules that keep the project small — one additive prompt section
deterministic enforcement over prompt text, zero runtime dependencies, no
duplicate documents, `apply()` never throws, and attributed prompt changes.
Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © 2026 IEG contributors. The plugin package carries the same
license at [`LICENSE`](LICENSE).

Not affiliated with or endorsed by DeepSeek-AI.
