---
doc_type: maintenance-handoff
project: information-environment-governance
plugin_version: 0.12.1
version: 0.12.1
status: active
owner: maintainers
last_reviewed: 2026-10-03
revision: 0.12.1-batch-7
host_baseline_verified: dsh-0.2.1-alpha.1
supersedes: none
language: en
---

# IEG Maintenance Handoff

> **This is the maintained status record (package 0.12.1).** §3–§4 are the single
> source of truth for current status and numbers; other documents link here rather
> than restate them. §13 is **history** (the rename, the withdrawn capability, the
> old→new gate mapping, the `0.1.0`/v0.2.0 rounds, and the open-item closures).
> §13 content is labelled **HISTORICAL** or **RETIRED** and is not a current
> capability.

> **Read this first.** IEG — the sanctioned short form for
> `dsh-information-environment-governance` — is **not production-ready**; the open
> blockers are in §4. Everything in §3 is verified and reproducible; everything
> in §4 is not.

## 1. What this is

`dsh-information-environment-governance` (IEG) is an additive project-work
governance plugin for DeepSeek Harness. It governs the **information
environment** — the canonical definition is in
[`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) §1, not restated here. It has **two
governance entry points**: Project Constraint Governance, and Information /
Document Governance (workspace hygiene is an enforcement mechanism inside the
second). It contributes **one** system-prompt section and enforces through
`agent/pre-step`, `tools/pre-execute`, `ctx.tools.guard`, and
`ctx.storageDomain`.

The three enabled modules are `project-governance` (`FC-2.1`)
`information-integrity` (`FC-2.3`), and `workspace-governance` (`FC-2.2`).
`user-attention`/`FC-2.4` was removed in 0.7.0 — see §13.

Out of scope, and not to be drifted into: general AI safety/security
sandboxing, authorization, user-attention optimization (**RETIRED** — the
capability was withdrawn in 0.7.0, §13.2), and unrelated agent behavior
management (authoritative statement: [`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) §1.4).

| Path | What it is |
|---|---|
| [`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) | positioning, scope, goals, requirements, success criteria |
| [`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md) | architecture; **Part A** verified host seams and deltas, **Part B** the target design and §32 gates |
| [`IMPLEMENTATION-VALIDATION-HANDOFF.md`](IMPLEMENTATION-VALIDATION-HANDOFF.md) | retired — pointer to the §32 gates and the historical build order |
| repository root | the implementation: `package.json` + `cordis.patch.yml` (the DSH bundle), `src/**` (TypeScript source of truth), `lib/**` (committed build output), `bin/ieg`, `test/`, `test-support/`, and `scripts/verify.sh`. There is no `plugin/` subdirectory |
| [`eval/`](eval/README.md) | behavioural and end-to-end evaluation |

## 2. Run everything

The full check set and the commands that run it are maintained once, in
[`CONTRIBUTING.md`](CONTRIBUTING.md) §Running the checks. Behavioural evaluation
(costs model calls, uses an isolated `DSH_HOME`) is documented in
[`eval/README.md`](eval/README.md); its entry points are:

```bash
node eval/e2e.mjs 4 auth-doc-request   # real agent runs, re-installs first
node eval/e2e-analyze.mjs              # derives ordering from tool/call events
```

## 3. Verified state (single source of truth for status and numbers)

### Batch 10 gate evidence register (B10-P0-02, B10-P0-03)

Terminal status vocabulary is Batch 10 §13 — **PASS** (current evidence demonstrates the
original condition) or **BLOCKED / UNVERIFIED** (evidence insufficient). Every row
references the frozen baseline above: commit `a71a440`, package `0.12.1`, `PROMPT_VERSION`
`0.5.0`, DSH `0.2.1-alpha.1`.

| Gate | Original condition | Execution method / evidence at the frozen baseline | Terminal status | Limitations, and unblock condition when blocked |
|---|---|---|---|---|
| **A** Host compatibility | IEG is additive and the host prompt survives | `test/integration/composition.test.js`; `verify.sh` compose phase — pass | **PASS** | — |
| **B** Semantic non-conflict | no module contradicts an identified host semantic | executable prompt-conformance suite — pass | **PASS** | — |
| **C** Behavioural improvement | at least one target failure mode improves measurably against baseline | **Attempted and not executable at this baseline (§4 attempt table).** The §32.5 protocol needs real control/treatment `dsh` runs; no rubric is frozen, `eval/runs/` does not exist and never has, `eval/harness.mjs` seeds and scores but does not execute a subject, `eval/e2e.mjs` defaults to 3 repetitions over 2 of 4 scenarios and has no model parameter, and no non-English scenario exists | **BLOCKED / UNVERIFIED — Evidence Insufficient** | Any run would evidence a filesystem-derived proxy, not the full requirement; §4.1. **Unblock:** an operator-driven run at this baseline with a rubric frozen first, ≥8 repetitions per arm per scenario across all four families, ≥2 models, one non-English scenario, and blind judging |
| **D** Information integrity | known-invalid information is no longer authoritative by default, and the D14 deletion policy is applied | **Attempted and not measurable at this baseline (§4 attempt table); capability implemented and tested, not measured.** R8-02 puts the lifecycle in the real runtime path (`test/integration/wiring.test.js`); no invalidated-information scenario exists in `eval/scenarios.mjs` | **BLOCKED / UNVERIFIED — Evidence Insufficient** | IEG has no read-time enforcement — the host's `tools/result` is emit-only with a frozen result — so any measurement can evidence write-time invalidation and reintroduction control only; §4.2. **Unblock:** as Gate C, plus the dedicated invalidated-information scenario |
| **E** Regression resilience | compaction, resume and fork preserve governance state | `durability-storage.test.js` (real storage stack) — pass | **PASS** | — |
| **F** Diagnosability | mount and gate decisions observable without a logger exporter | `diagnostics.test.js`; `ieg_status`; `ieg:status` line — pass | **PASS** | — |
| **G** Agent isolation | two live agents in one composition never share governance state | `agent-isolation.test.js`; `state.test.js` — pass | **PASS** | — |
| **H** Compatibility baseline | the adapter reports a verdict and detects a simulated host section change | `compatibility.test.js` — pass | **PASS** | — |
| **I** Packaging | installable, licensed, changelogged, peer-range enforced | `verify.sh` phase 3b (pack the real tarball → fresh profile → compose the `ieg` row) — pass; `test/integration/packaging.test.js` — pass; the host's own `evaluatePluginCompatibility`, executed against this manifest, returns *compatible*, and against an out-of-range declaration **refuses** it with the exemption remedy | **PASSED — Evidence Complete** | Publication is release authorization (Batch 11), not one of the four conditions. A satisfied version range says nothing about seam drift, which is why the adapter still observes seam facts |
| **J** Withdrawal integrity | three modules ship with no dangling reference to the removed `user-attention` capability | withdrawal tests — pass | **PASS** | — |

**No gate was passed by inference, and no criterion was weakened.** C, D and I end blocked
because the evidence does not exist — which Batch 10 §1 and §14 explicitly accept as the
correct outcome.

**No equivalent validation method was adopted.** Every candidate proposed for C and D is a
substitution Batch 10 §6 prohibits, and each was rejected for that reason:

| Candidate substitute | Prohibition violated |
|---|---|
| `npm test`, including the simulated `gate-precision.test.js` | unit tests standing in for behavioural improvement |
| Structural integration tests and `verify.sh` phases | same — and `eval/README.md` states a green structural suite is not evidence of behavioural improvement |
| Prompt-conformance tests (byte ceiling, content rules) | unit tests standing in for behavioural improvement |
| A scripted, synthetic or delegated agent as the subject | synthetic agent behaviour standing in for required real-agent behaviour |
| Model narration or IEG's own `ieg.information_invalidated` diagnostics as the outcome | model self-reports standing in for filesystem/observable outcome evidence |
| `eval/e2e.mjs` at its defaults (3 repetitions, 2 English scenarios, one model) | reduced repetitions; single-model evidence presented as generalizable |
| Re-scoring existing sandboxes or citing earlier results | historical results presented as evidence for this baseline |
| The R8-02 lifecycle integration test as Gate D's evidence | unit tests standing in for behavioural improvement |
| `compatibility.test.js` as proof the peer range is "enforced" | not enforcement on its own — the clause is evidenced by the `peerDependencies` declaration plus the host's own evaluator refusing an out-of-range declaration |

One baseline item is recorded as absent rather than invented: **no rubric is frozen**, and the
method requires a rubric frozen before the runs. That absence is a first-class reason Gates C
and D cannot pass.

### Batch 10 validation baseline (frozen 2026-10-07)

Every Batch 10 validation result references exactly this target. A behaviour-affecting
change after this freeze invalidates the affected result and requires re-validation; no
substitution of another commit, prompt revision, DSH version or evaluation configuration is
permitted.

| Baseline item | Value |
|---|---|
| Repository commit | `a71a4401dfa67f1f50943757447ad6e4d3792ae1` (`a71a440`) |
| Package version | `0.12.1` |
| `PROMPT_VERSION` | `0.5.0` |
| Verified DSH baseline | `0.2.1-alpha.1` (peer range `>=0.2.1-alpha.1 <0.3.0`) |
| Validation method revision | the commit above; the method is defined by `eval/README.md` and `eval/harness.mjs` |
| Rubric revision | **none frozen** — `eval/README.md` requires a rubric frozen before the runs; no rubric has been frozen, which is a first-class reason Gates C and D cannot pass (below) |
| Evaluation configuration ids | scenario families `doc-consolidation`, `auth-doc-request`, `vague-continuation`, `bounded-repair`; arms `control` / `treatment` |
| Validation start (UTC) | 2026-10-07T12:06Z |
| Working tree at freeze | clean (`git status --short` empty) |


**Mechanisms — 3 modules, 6 tools.** The plugin ships
`project-governance` (`FC-2.1`), `information-integrity` (`FC-2.3`), and
`workspace-governance` (`FC-2.2`), all enabled by default, and registers exactly
six tools: `record_orientation`, `record_information`, `confirm_terminology`,
`confirm_information`, `ieg_status` and `maintain_environment`. It compiles
**one** prompt section, `ieg:governance` (`order: 8500`, `interpolate: false`
`complete` never set), at **`PROMPT_VERSION` 0.5.0**. The compiled section is
**2,806 bytes**; the recorded ceiling is **2,945 bytes** (floor 1,400, hard cap
4,096). Integration tests mount the real `dsh-system-prompt`, `dsh-tools`
`dsh-fs-local`, and the `dsh-storage`/`dsh-storage-json`/`dsh-storage-domain`
stack — not mocks. **272 tests (all pass, no todo, no skip) and 27/27
verification checks** were derived from the current tree on 2026-10-03, the 0.8.0
three-module packaging round. Counts move with each round; re-derive them with
`npm test` and `scripts/verify.sh`, and treat the numbers printed there —
not this sentence — as current. (The 0.7.0 round recorded 265 tests, and the
0.6.0 four-module round recorded 284 tests and 22/22 checks; both are
**HISTORICAL**.)

**Host baseline.** The single supported DSH baseline is **`0.2.1-alpha.1`**:
`dsh.engines.dsh` is `>=0.2.1-alpha.1 <0.3.0`, `dsh.compatibility.dshReleases`
records that one release as `verified`, and `lib/compatibility-baseline.json` was
re-captured against it in 0.8.0 (section order and host prompt hash `ceb63ee5`
identical to the previous baseline). The retired `0.2.0-rc.2` baseline is
**SUPERSEDED**: it is gone from the peer range and the release map. There is no
legacy compatibility layer; the adapter observes seam facts against the committed
baseline rather than branching on a version string.

**Durable state.** Governance state uses the `ctx.storageDomain` domain
`ieg_governance` at `DOMAIN_VERSION` 1. State written under the pre-0.7.0 domain
name is **not** migrated; only throwaway profiles are supported, so that is
accepted rather than handled.

**Behaviour — no current measurement.** The end-to-end results that used to stand
here were measured against earlier prompt revisions that no longer exist (a
five-module and then a four-module prompt). Those numbers and their sandboxes
were deleted as superseded rather than annotated, because a stale number still
reads as a standing result. **Gates C and D are therefore Blocked / Unverified —
Evidence Insufficient at the current revision**; a fresh `eval/` run with a rubric
frozen beforehand and a judge that does not see the arm is what produces a valid
number (§4.1, §4.2).

**Acceptance gates (A–J).** Renumbered in 0.7.0 after the withdrawal of the
`user-attention` gate; the old→new mapping is in §13. The maintained table is
[`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
§32.1; the summary is:

| Gate | Statement | Status |
|---|---|---|
| A — Host compatibility | IEG is additive and the host prompt survives | met |
| B — Semantic non-conflict | no module contradicts an identified host semantic | **Passed — Evidence Complete** |
| C — Behavioural improvement | at least one target failure mode improves measurably against baseline | **Blocked / Unverified — Evidence Insufficient** |
| D — Information integrity | known-invalid information is no longer authoritative by default | **Blocked / Unverified — Evidence Insufficient** |
| E — Regression resilience | compaction, resume, and fork preserve governance state | **Passed — Evidence Complete** |
| F — Diagnosability | mount and gate decisions are observable without a logger exporter | **Passed — Evidence Complete** |
| G — Agent isolation | two live agents in one composition never share governance state | **Passed — Evidence Complete** |
| H — Compatibility baseline | the adapter reports a verdict and detects a simulated host change | **Passed — Evidence Complete** |
| I — Packaging | installable, licensed, changelogged, peer-range enforced | **Blocked / Unverified — Evidence Insufficient** |
| J — Withdrawal integrity | the plugin ships three modules with no dangling reference to the removed one | **Passed — Evidence Complete** |

**Mount resilience (2026-10-02).** `apply()` does not throw: a configuration
fault mounts an inert but observable surface (`mounted: false`, `configError`
`ieg.config_invalid`) instead of being reported by the host as an unactivated
entry, each capability is registered in its own guarded step, an absent seam is
recorded as `ieg.capability_missing` and listed in the mount record's
`degraded[]`, and logger narration is best-effort. Covered by
`test/integration/wiring.test.js` and proven against the **installed** artifact by
`verify.sh`'s installed-artifact check.

**Diagnosability and compatibility.** A bounded ring, the `ieg:status`
runtime-context line, and the read-only `ieg_status` tool report mount
configuration, last denial, and the compatibility verdict without a logger
exporter. `lib/kernel/compatibility.js` observes the real
`system-prompt/assemble` waterfall and classifies `COMPATIBLE |
COMPATIBLE_WITH_WARNINGS | UNSUPPORTED | PENDING` against a committed baseline.

### Capability boundary matrix (Batch 6 audit)

What IEG actually does, as opposed to what its prompt asks for. **deterministic**
means code enforces it; **heuristic** means a bounded, fail-open signal decides;
**guidance** means the model must interpret it and nothing verifies the result.

| Area | Status | Mechanism | What is missing |
|---|---|---|---|
| Artifact creation governance | implemented + heuristic | `tools/pre-execute` classifies `write`/`edit` as persistent mutation, protected paths are denied outright, `ctx.tools.guard` is the monotonic backstop, and role-aware overlap decides duplication | no semantic (meaning-level) equivalence test |
| Duplicate information prevention | heuristic, role-aware | `overlap.ts`: token Jaccard, filename-subject coverage, plus an injected functional-role classifier and material-distinctness predicate; `ask` or `deny` per config | still lexical at bottom; a paraphrase with different wording and headings is not caught |
| Cross-document consistency | **not implemented** (future) | nothing | a free-text stale-statement scan was written, run against this repository and **removed**: ten false `REQUIRES_REVIEW` findings on a healthy tree. Only *declared* state is checked |
| Stale information handling | partial | `information-integrity` state machine (statuses, dispositions, reintroduction detection) for recorded items; declared `plugin_version` drift detection; a `status: retired` artifact becomes a `DEPRECATE` proposal | prose-level staleness is not detected; recording depends on the agent calling the tool |
| Periodic maintenance | implemented | the `maintain_environment` round (inventory, diagnosis, planning) plus the seven-instruction-batch counter on the host's own turn accounting | the round proposes; nothing is applied automatically, by decision |
| Change-impact reconciliation | partial | `reconcileChange` through `maintain_environment { changed }`: affected artifacts by subject, declared drift, unresolved report | subject matching is lexical; contradictions beyond declared state are not detected |

### Prompt rule → capability boundary

Every rule in the compiled section, mapped (Batch 6 §8). This is the audit that
precedes any prompt edit; the text itself is unchanged in 0.10.0.

| Rule | Boundary |
|---|---|
| Supplement the host, never replace it; the host instruction governs | guidance, and structurally true: one additive section, `complete` never set |
| Prefer a safe refusal over unauthorized action | deterministic at the gate (deny/ask); guidance for actions the gate does not classify |
| Unresolved uncertainty may persist unless proceeding would be unsafe | guidance |
| Diagnose before acting destructively; report the blocking condition | guidance |
| State intent and scope before the first change | **guidance only** — the orientation *record* is required when `requireBeforeMutation` is on, but its content is never verified |
| Distinguish requirements, assumptions and unknowns | guidance |
| Derive the best-supported reading when intent is unstated | guidance |
| Preserve established terminology; never silently redefine the task | **guidance only** — no runtime check exists, and none is claimed |
| Re-check scope when direction changes and state it | guidance |
| State the ordered task flow, revise it explicitly | guidance (captured by `record_orientation` when the gate requires it) |
| Treat project information as having a status | deterministic for recorded items (`information-integrity` transitions) |
| Delete what is established wrong; mark outdated instead in software projects | guidance — the maintenance round *proposes* `DEPRECATE`/`REMOVE`; nothing deletes |
| Never present invalid, superseded or unconfirmed information as authoritative | deterministic for recorded items; guidance otherwise |
| Re-promoting invalidated information requires new evidence | deterministic for recorded items (`findReintroduced`) |
| Remove a wrong claim at the source | guidance |
| Run a maintenance round when the environment reports maintenance due, and report its proposals | counter is deterministic (turn-keyed); the timing and the proposal are guidance |
| Distinguish read-only inspection from persistent mutation | deterministic (`classifyMutation`) |
| Do not create persistent artifacts merely because convenient | heuristic (overlap check) plus guidance |
| Before creating, look for an existing artifact serving the same purpose | heuristic, now role-aware, plus guidance |
| Never claim authorization the user has not given | deterministic (mutation gate, approval path) |
| A previous approval is not standing authorization | guidance reinforced per call: the gate asks each time |

### Terminology authority model (Batch 7 Phases 7-9)

The glossary is **persistent project state**, not a prompt list: it lives on the
project ontology beside the constraints and assumptions it belongs with
(`ProjectState.glossary` in `src/modules/project-governance.ts`), and it is
implemented in `src/kernel/glossary.ts`.

**Precedence**, highest first — a lower rung never overrides a higher one:

| # | Rung |
|---|---|
| 1 | DSH host semantics |
| 2 | an explicit current user instruction or clarification |
| 3 | user-confirmed project terminology |
| 4 | authoritative project documentation |
| 5 | provisional / inferred glossary entries |

The invariant: **an agent-inferred entry never becomes unquestionable authority
merely because it has been persisted.** It is enforced in code, not by the prompt
asking nicely: an inferred upsert of an existing `CONFIRMED` or `DEPRECATED` entry
is *refused* with its reason (`upsertTerm`), inference always yields
`PROVISIONAL` with `confirmedByUser: false`, and `confirmedByUser: true` is only
reachable through `confirmTerm`, which records `source: 'user'`. Conflicted entries
cannot be user-confirmed, and `deserialiseGlossary` drops any persisted entry that
violates an invariant, so corrupt state cannot re-enter as authority.

**Three behaviour tiers, with the non-overreach rule for each:**

| Tier | Trigger | Behaviour | Must not |
|---|---|---|---|
| 1 | known harmless alias | accepted; the canonical form is available for generated artifacts | interrupt, block or repeatedly correct the user |
| 2 | materially ambiguous term | surface the readings, state the inferred one, ask when it matters | guess silently and proceed |
| 3 | conflict with established semantics or documentation | surface it, state the difference, seek resolution | pick a meaning because the glossary lists one |

`resolveTerm()` returns `exact | alias | deprecated | ambiguous | conflicted |
unknown`. None of those kinds is a verdict about the user, and none blocks work —
`alias` is the accept-silently case, and `unknown` is not corrected.

**Verified by** `test/unit/glossary.test.js`: the ten acceptance scenarios the batch
names, each paired with its non-overreach counterpart, plus the invariant tests and
the orientation capture path.

**Known limitation, stated rather than glossed:** `confirmedByUser` is *asserted by
the agent* when it reports the user's explicit statement. The system records the
assertion, attributes it as `user`-sourced, and exposes it on the status surface,
but it cannot independently verify that the user said it. An agent that mis-asserts
confirmation could grant a term authority the user never gave it.

### Batch 8 baseline, change log and the pre-execution verifications (R8-00)

Recorded **before** any Batch 8 change, so every later claim refers to one state.

| Fact | Value |
|---|---|
| Starting revision | **v0.12.1** (tag) — the frozen Round 7 baseline; the tree at the time of writing is ahead of it by documentation-only commits |
| Verified DSH baseline | **0.2.1-alpha.1** (Verified; CI installs exactly this in a required job) |
| Package / plugin version | 0.12.1 |
| `PROMPT_VERSION` | 0.5.0 (compiled section 2,806 bytes, ceiling 2,945) |
| `DOMAIN_VERSION` | 1 |
| Gate C status before Batch 8 | **unmet** — unmeasured |
| Gate D status before Batch 8 | **unmet** — unmeasured |
| Runtime dependencies | zero |

**Invalidation rule carried into the batch:** any prompt or runtime behaviour change after
the evaluation freeze invalidates a pending behavioural result. Batch 8 changes behaviour
(R8-01, R8-02, R8-04), so the Round 7 frozen baseline cannot be presented as the evaluated
surface — the evaluation must run against the post-Batch-8 revision.

**Batch 8 change log** — updated as each task lands:

| Task | Status | Commit | Files | Tests / evidence |
|---|---|---|---|---|
| R8-00 baseline | **done** | this commit | this section | baseline table above |
| R8-01 authority boundary | **done** | this commit | `src/kernel/orientation.ts`, `src/index.ts`, `src/kernel/diagnostics.ts`, `test/unit/glossary.test.js`, `test/integration/wiring.test.js` | the model-facing `confirmedByUser` flag is gone (orientation capture is always inference); promotion moved to `confirm_terminology`, gated unconditionally through the host approval service; 3 regression tests (self-attestation ignored, `ask` under `policy: allow`, user-sourced promotion); 287/287 |
| R8-02 information-integrity loop | **done** | this commit | `src/modules/information-integrity.ts`, `src/kernel/state.ts`, `src/index.ts`, `test/integration/wiring.test.js` | ledger on the canonical model in per-agent state; `record_information` (capture + transitions, no model-supplied confirmation) and the approval-gated `confirm_information` (revalidation); write-time reintroduction detection; one end-to-end test covering valid → invalidation → supersession → stale reuse → correction → reintroduction → revalidation; 288/288 |
| R8-03 mutation governance | **done** | this commit | `src/modules/workspace-governance.ts`, `test/unit/workspace-governance.test.js`, `test/unit/shell-classification.test.js`, `SECURITY.md` | lexical canonicalisation of `.`/`..` (closed a protected-path bypass), root-boundary fix, execution-prefix recognition for wrapped shells (closed a `sudo bash -c` blind spot), 400-variant fuzz + adversarial cases, and an explicit advisory-boundary statement; the runtime-assembled-payload limit is asserted as a limitation, not papered over |
| R8-04 supported scope | **done** | this commit | `src/modules/workspace-governance.ts`, `src/kernel/config.ts`, `test/unit/shell-classification.test.js`, `PRODUCT-SPEC.md`, `README.md`, `SECURITY.md`, `docs/PACKAGE-REFERENCE.md`, `ARCHITECTURE-SPEC-AGENT-REFERENCE.md` | PowerShell runtime surface and tests removed (the generic tool-list abstraction is retained, not replaced by hardcoding); scope stated as Debian/Linux + DSH in product, security, architecture and onboarding docs; two doc claims that R8-03 had made false were corrected |
| R8-05 TS migration + decomposition | **in progress** | `536b8dd`, this commit | `scripts/verify.sh`, `src/host/tool-surface.ts`, `src/index.ts` | **done:** drift protection in the release gate (24 checks), falsified against committed drift; the tool surface (names, `renderJson`, the user-authority set) extracted into `src/host/`, establishing the layer boundary, with the public names re-exported so the API is unchanged. **Further:** the maintenance tool registration (115 lines) extracted into `src/host/maintenance-tool.ts` behind an explicit `MaintenanceToolSurface` — the dependency that was captured by the closure is now named and passed in, and a version pair travels through the surface so the host module never imports the entry point (no cycle). The information-tools registration (76 lines) followed into `src/host/information-tools.ts` behind `InformationToolSurface`. The governance tool registrations (orientation, status, terminology, the guard and the audit wrapper `observed`) followed into `src/host/governance-tools.ts` behind `GovernanceToolSurface`. The pre-step orientation gate followed into `src/host/pre-step-gate.ts`, and the mutation gate into `src/host/mutation-gate.ts` behind `MutationGateSurface`. The durable-state section followed into `src/host/durable-state.ts` as `createDurableState`. `src/index.ts` is 826 lines from 1287, with seven host modules. **Extractions must be committed one at a time**: the durable-state work was verified green and then lost when the next, uncommitted attempt was reverted, and had to be redone. **Remaining, with the order the next attempt needs** — the earlier attempts failed partly for a structural reason worth recording: `note`, `guarded` and `livePromptFacts` are defined in the **observability block** (lines 438-573) and consumed by every later section, so they must be extracted **first**, as a factory the entry point calls, and then passed to the other sections through their surfaces. In `src/index.ts` today:

| Section | Lines | Depends on |
|---|---|---|
| observability (`note`, `guarded`, `noteMissing`, `livePromptFacts`, ring wiring) | 438-573 | config, logger, export mirror |
| user-editable prompt | 574-593 | prompt store |
| diagnostics mirror | 594-632 | export helper |
| compatibility adapter | 633-660 | baseline |
| durable state (`hydrateOrientation`, `persistOrientation`) | 661-717 | storage domain |
| 1. prompt section | 718-754 | note, prompt facts |
| 2. pre-step orientation gate | 755-799 | note, governance |
| 3. mutation gate (`tools/pre-execute`) | 800-926 | note, config, ledger, overlap |
| 5. mount record | 978-1022 | config, registry, prompt stats |

**Mechanics that must be right** (each cost a revert): anchor an extraction on the *enclosing function's* closing brace, never on the next section marker; extract individual statements so earlier `register*(...)` calls are not swallowed; and rebuild the file by appending every line **not** inside an extracted range, asserting `old - removed + call` before writing. So "index.ts is primarily composition/wiring" is **not yet met** |
| R8-06 reproducible builds | **done** | this commit | `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `test/integration/packaging.test.js` | toolchain pinned exactly (`typescript@6.0.3`, no range) and the package manager declared; lockfile committed; both workflows install with `npm ci --ignore-scripts` instead of a floating global; a test asserts zero runtime dependencies, an exact toolchain pin and a committed lockfile |
| R8-07 version source of truth | not started | — | — | — |
| R8-08 docs vs history | not started | — | — | — |
| R8-09 state schema evolution | not started | — | — | — |
| R8-10 multilingual overlap | **done** | this commit | `src/kernel/overlap.ts`, `src/host/maintenance-tool.ts`, `test/unit/overlap.test.js` | tokenisation is Unicode-aware (`\p{L}\p{N}` runs; character bigrams for Han/Hiragana/Katakana/Hangul, which have no word spaces). Before it, a Chinese document produced **zero** tokens, so duplicates and unrelated files both scored 0. Now a zh duplicate scores 0.85 against the 0.4 threshold and an unrelated one 0.00. Fixtures: simplified, traditional, mixed, Markdown/code boundaries. Scan coverage is explicit — `complete`, `bounded` (document bound), `partial` (unreadable entries, listed in `skipped`) — and the round reports it. **Honest mapping of the five named states:** *read failure* is reported per entry via `skipped` and folds into `partial`; *unsupported format* is a file filter, not a coverage state, and is not claimed as one |
| R8-11 credential workflow | **done** | this commit | `eval/README.md`, this document | the hardcoded developer credentials path is gone; credentials are **operator-supplied** (`IEG_EVAL_CREDENTIALS`) or the host's own authentication, with no home-directory assumption anywhere in the repository; a **cleanup assertion** fails loudly if a staged copy remains; and the doc states that no `eval/` artifact can capture a secret because `e2e.mjs` never reads the credentials file |
| R8-12 Gate C/D closure | **recorded: gates unmet with cause** (§12) | this commit | `ARCHITECTURE-SPEC-AGENT-REFERENCE.md` §32.1, this document | Gates C and D are formally **unmet**, with the exact blocking cause recorded rather than the criterion weakened: no control/treatment measurement exists for any post-0.9 revision, the harness does not execute the subject, and a delegated agent cannot stand in (its profile's `workspace.policy: ask` fails closed). Gate D's *capability* is implemented and tested by R8-02; what is missing is the measurement. The evaluation itself remains outstanding and needs an operator-driven run |
| R8-13 artifact cleanup | not started | — | — | U8-03 verified below |

#### Maintenance round run on the Batch 8 tree (2026-10-05)

The runtime marked maintenance due during this work — seven direct user instruction
batches, counted by the Batch 6 trigger through the host's turn accounting — so a round
was run at the next safe boundary, as the plugin's own rule requires.

Result, on the current revision: **24 artifacts scanned**; inventory
`configuration=9, implementation-documentation=9, unknown=3, authoritative-specification=2,
historical=1`; findings `LEAVE_UNCHANGED=22, KEEP=1, DEPRECATE=1`; **unresolved = 0**, no
false positives.

The single actionable proposal is `IMPLEMENTATION-VALIDATION-HANDOFF.md`, which declares
`status: retired` — correctly identified as history rather than current guidance. It is a
**proposal**: the round does not apply destructive actions, and R8-13 is where artifact and
stale-information cleanup is decided.

#### R8-06 verification: the reproducible install path was exercised, not just asserted

R8-06's claim is that a build does not depend on what the registry serves that day. That
was asserted by a test and used by CI, but with CI unable to schedule a run (see below) the
path was exercised directly:

```
npm ci --ignore-scripts   ->  added 1 package in 3s
./node_modules/.bin/tsc --version  ->  Version 6.0.3
npm test                  ->  301/301 pass
```

So a **clean install from the committed lockfile resolves exactly one package — the pinned
compiler — and builds and passes the full suite from it.** That is the same path CI's jobs
take.

**What this does *not* replace:** CI's Node 20/22/24 matrix and its job that installs
`dsh@0.2.1-alpha.1` + `pnpm@12.9.1` and runs the release gate against a *real* host. The
local run used the host checkout already present in this environment.

**CI state (P0-2, verified 2026-10-06): green on the latest `main` commit** — all five jobs
completed successfully, including the required `full verification chain (verified host
0.2.1-alpha.1)`. That job installs the pinned `dsh@0.2.1-alpha.1` and `pnpm@12.9.1`, so the
green run is also the evidence that the pinned toolchain remains installable.

One earlier run, on `aea534c`, concluded **failure** for an environmental reason rather than
a code defect: three of its five jobs (`Node 20`, `Node 24`, and the required verified-host
job) were **cancelled after exactly 15 minutes with no runner ever assigned**, while `Node 22`
and `documentation health` did obtain runners and passed. The workflow's `concurrency` group
(`cancel-in-progress: true`) cancels superseded runs, but that was not the cause: no push
followed for nineteen hours. The cause is **runner starvation** — GitHub cancels a job that
cannot obtain a runner within fifteen minutes — and it cleared by itself.

*Superseded statement, kept for the record:* the previous text here said no completed CI run
existed for the last code change. That was accurate when written — successive pushes had
cancelled the earlier runs and the remainder sat queued — and it is no longer true.

#### P1-1: the Phase 13 `ieg.config_invalid` — non-reproduction, and what it rules out

Phase 13 recorded that a complete config restated from IEG's own row passed `--dump-config`
but produced `ieg.config_invalid` in a live session. The cause was never established. What
is now established, by test rather than by recollection:

**A complete restatement validates and mounts cleanly.** `test/integration/wiring.test.js`
builds the row with every top-level key explicit (`enabled`, `sectionOrder`, `modules`,
`workspace`, `preStep`, `prompt`, `diagnosticsExport`, `diagnostics`), asserts those keys are
exactly the ones the shipped `cordis.patch.yml` declares, and then asserts that it
`resolveConfig`s, `buildGovernance`s, mounts with `mounted: true`, reports no `configError`,
and produces **no `ieg.config_invalid`**.

Two candidate causes are therefore **ruled out**:

| Tried | Result |
|---|---|
| The restated row as an override layer writes it | validates, mounts, no `config_invalid` |
| A *resolved* config fed back into `resolveConfig` (the restatement was generated programmatically, so a resolved shape carrying keys the input schema rejects would explain the fault exactly) | accepted; the resolved shape's keys are a subset of what the validator takes |
| A key-coverage mismatch between the restatement and the shipped row | not present; asserted equal, and it fails loudly if the shipped row gains a key |

**What remains unexplained, and why it is out of scope here.** The live path differs from
these tests in exactly one respect: in a live profile the config reaches IEG through the
Cordis **loader's patch mechanism**, not through `apply(ctx, rawConfig)`. Reproducing that
requires mounting into a real profile — and Batch 9 §12 forbids touching the live profile.
The residual hypothesis is therefore **patch-layer semantics** (a second `insert` layer for
`id: ieg`, or last-write-wins interaction), not the validator: the validator is exercised by
the tests above and accepts every shape tried. This is recorded as a non-reproduction with
its boundary, not as a fix, and no validator change was made — none was warranted.

#### R8-12 status: Gates C and D recorded **unmet**, with the blocking cause

Batch 8 §12 is explicit: *"If either gate cannot honestly be met, record it as unmet with the
exact blocking cause rather than weakening the criterion."* That is this record — not a
closure, and not a rewording of the gate.

**The blocking cause, in one sentence:** no control/treatment measurement exists for any
post-0.9 prompt revision, because the harness seeds and scores but does not execute the
subject, and a delegated agent cannot stand in — it inherits this session's profile, whose
shipped `workspace.policy: ask` fails closed for want of an approval channel (observed
twice, Batch 6 and Batch 7).

**What is in place and what is missing.**

| Requirement | State |
|---|---|
| Real control/treatment execution | **missing** — the instrument exists (`eval/harness.mjs` seeds both arms, writes the exact prompt each subject receives, and scores from the filesystem) but the subject is not run |
| Frozen independent rubric | **missing** — nothing has been frozen, because there is nothing yet to score |
| Repetitions, ≥2 models, one non-English scenario | **missing** — the three failed attempts to relax the host gate are recorded in the Phase 13 section above |
| Gate D capability (non-authoritative default, reintroduction control, D14 disposition) | **implemented in the runtime path** by R8-02, and tested end to end — but implemented is not measured |
| Read-time enforcement | **absent, and stated as absent**: the host freezes tool results, so IEG cannot mark or withhold a retrieval |

**What would close them:** an operator-driven evaluation against the post-Batch-8 revision —
repeated trials, blind judging, at least two models, one non-English scenario, across the
four scenario families — with the six measures the batch names. Until then the gates stay
**unmet**, and no document claims otherwise.

#### R8-13 measurement baseline (measured, not assumed)

R8-13 asks for **actual before/after storage measurements** rather than an assumed
reduction. Its cleanup is gated behind R8-07/R8-08/R8-12, but the measurement is
independent, so the *before* state is recorded here:

| Measure | Value (2026-10-05, before any R8-13 cleanup) |
|---|---|
| Git-tracked `*.tgz` files | **0** |
| `.gitignore` rules blocking tarballs | **2** (`*.tgz`, `*.tgz.sha256`) |
| `*.tgz` ever added in history | **1** (a single historical blob; absent from the tree) |
| Working tree excluding `.git` | **2.4 MB** |
| `.git` | **2.3 MB** |
| Published tarballs | Release assets (v0.9.x … v0.12.1), not repository objects |

The honest reading: **there is nothing to remove from the tracked tree**, and the
measurable Git impact of the tracked-artifact portion of R8-13 is therefore **zero**. The
only remaining artefact is the single historical blob, and R8-13 §6 forbids rewriting
history for cleanliness without a separate justified migration plan. A "size reduction"
claim for this task would be fabricated; the correct report is that the premise is already
satisfied.

#### U8-02 — the user-confirmation seam: **verified, not invented**

The host seam is the **tool-registry approval path**: `tools/pre-execute` returns
`{ kind: 'ask' }`, the registry resolves it through the host's approval service, and the
tool body runs **only on approval**; with no approval channel the host degrades `ask` to
denial. This is not a proposal — IEG already relies on exactly this path for its mutation
gate, and it is documented in the contract at `lib/contract.d.ts`: *"`ask` is resolved by
the tool registry through `ctx.approval`; with no approval channel the host degrades `ask`
to denial."*

Consequence for R8-01: the model must lose the ability to set `confirmedByUser`
(the orientation schema's flag is model-supplied, so it is not authority), and promotion
to `CONFIRMED` must happen in a tool body that is **unconditionally routed through
approval** — independent of `workspace.policy`, because this is a user-authority
operation rather than a workspace mutation. Under that design the model cannot manufacture
confirmation: the host decides, and a denial changes nothing.

**Not yet verified, and deliberately not assumed:** whether a *user message* payload is
readable as text (the ambient contract types `agent/pre-step`'s `messages` as `unknown[]`).
The approval path above needs no such assumption; `agent/pre-step` remains usable for
counting instruction batches, which is all IEG currently does with it.

#### U8-03 — historical `.tgz` location: **verified**

- **Git-tracked `.tgz` files: 0.** `.gitignore` already ignores `*.tgz` and
  `*.tgz.sha256`, so a newly generated tarball cannot silently re-enter Git.
- **Exactly one `.tgz` was added at some point in history** (`git log --all
  --diff-filter=A -- '*.tgz'`). It is not in the current tree.
- **Release assets are separate**: the published `.tgz` files live as GitHub Release
  assets (v0.9.x … v0.12.1), not as repository objects.

So R8-13's premise is already satisfied for the tracked tree, and its measurable storage
impact is **zero for Git** — the later decision is whether to rewrite history to purge the
single historical blob, which R8-13 §6 forbids without a separate justified migration plan.
Release assets are governed by the release policy, not by repository size.

#### Information-integrity runtime boundary (R8-02)

**What is implemented, in the real runtime path** — not as pure functions awaiting a
caller, which is the gap R8-02 named:

- a **ledger** over the canonical `InformationRecord` model, held in per-agent state, so
  the runtime path and the durable path share one representation;
- **`record_information`** captures a claim and moves it through the lifecycle
  (`PROVISIONAL` → `SUSPECT`/`INVALID`/`DEPRECATED`/`SUPERSEDED`, and `AUTHORITATIVE`
  only with evidence). **The model never supplies user confirmation**, so it cannot
  promote its own claim: the same boundary R8-01 established for terminology, applied
  where the original code exposed the identical hole (`transition(…, { userConfirmation })`
  was model-reachable);
- **`confirm_information`**, whose every call is routed through the host's approval
  service unconditionally, and whose body — reached only on approval — is what performs a
  *legitimate revalidation*;
- **reintroduction detection in the write path**: when a persistent write proposes text
  matching a disposed or non-authoritative record, the runtime records
  `ieg.information_reintroduced`. A correction retains the text it displaced
  (`disposedValue`), because the replacement is current and the *original* is the claim
  that must not return.

**What is deliberately not implemented, and therefore not claimed.** IEG has **no
read-time enforcement**. The host's `tools/result` is an emit-only event whose result is
frozen before observers run — verified in `dsh-tools`' own type documentation — so there
is no channel to inject a warning into a read, and no host seam by which IEG could mark or
withhold a document at retrieval time. The consequence is stated plainly: IEG can record
status, gate writes, and report attempted reuse, but it cannot prevent a model from acting
on stale text it reads. Any claim of "invalid information is non-authoritative at
retrieval" would be exactly the unsupported capability R8-02 §8 forbids.

### Phase 13 — behavioural evaluation: assessed, and blocked for a stated reason

**Status: not executed. Gates C and D remain unmeasured, and no behavioural result is
claimed for this revision.** Batch 7 §22 permits this only as an explicitly documented,
evidence-based blocker, which is what follows.

**What the instrumentation can and cannot do.** `eval/harness.mjs seed` creates a
sandbox per arm, writes the seed files and writes the exact prompt the subject
receives (control = framing + task + reporting; treatment = the compiled governance
section + the same). `measure` scores the outcome from the **filesystem**, not from the
subject's narration, so scoring is mechanical. Step 2, however, is *"the subject is a
real agent run"* — and nothing in this repository performs it.

**Why the runs could not be made here.** A delegated trial agent inherits *this*
session's profile. Under the shipped `workspace.policy: ask`, a delegated agent has no
approval channel, so `tools/pre-execute` fails closed and it cannot write in its
sandbox at all — verified twice in this project's history, most recently in Batch 6.
Relaxing that policy means editing the live profile, and two attempts were made and
both **reverted** rather than left in place:

1. a partial override (`workspace.policy` only) — withdrawn once the plugin's own patch
   documentation was read: *"a patch replaces the whole config, it does not merge"*, so
   it would have silently dropped `sectionOrder`, `modules`, `preStep`, `prompt` and
   `diagnostics`;
2. a **complete** restatement generated programmatically from the plugin's own row, which
   composed correctly under `dsh --profile web --dump-config` but then produced
   `ieg.config_invalid` in the live session. The cause was not established, and the
   change was reverted immediately rather than diagnosed by trial and error on a
   running session.

**What would unblock it**, in order of preference:

1. **the operator runs the trials.** Seed each pair with the harness, drive a real agent
   in each sandbox, return the Action Logs; the scoring stays mechanical. This keeps the
   live profile untouched and both arms fully governed.
2. **a throwaway profile.** A dedicated profile carrying the complete IEG row with
   `workspace.policy: allow`, verified in isolation before use. Delegated agents cannot
   be pointed at it from this session, so it needs an operator or a separate driver.

**Limitation that would remain even then:** IEG's runtime workspace gate is a property of
the *host profile*, so it applies to both arms. Trials run under a relaxed gate measure
the **compiled prompt section's** effect, not the runtime gates'. A complete Gate C
measurement must state which of the two it measured.

### Phase 14 — release-readiness decision

**No-go, and not determinable for the two gates that matter most.** Stated as verified
facts, inferences and limitations rather than as a single verdict.

**Verified facts.** 284/284 tests; `verify.sh` 23/23; `check-docs` green; all five CI
jobs green, including the required verified-host chain against `0.2.1-alpha.1`;
packaging verified from a fresh profile; 17 terminology acceptance tests covering the
ten required scenarios with their non-overreach counterparts; the release artifact is
reproducible with pinned tooling (TypeScript 6.0.3, pnpm 12.9.1).

**Inferences, marked as such.** The engineering baseline is coherent and the declared
compatibility claim now matches what CI actually exercises. Neither of those says
anything about whether IEG improves outcomes for a governed agent.

**Limitations.** Gates C and D unmeasured; `confirmedByUser` is asserted by the agent
and not independently verifiable; cross-document contradiction detection is absent;
`feature` behaviour has never been exercised by an external user.

**Recommendation for the next phase.** Do **not** publish or claim product validation.
Run the Phase 13 protocol first — repeated trials, blind judging, at least two models,
one non-English scenario, across the four scenario families — and treat inconclusive
results as inconclusive. The engineering baseline is ready to carry that evaluation;
the product hypothesis is not yet tested.

### Round 7 verification record and frozen evaluation baseline (Phases 11-12)

A **fresh** record, taken after every implementation change in this round — an old
result says nothing about modified code.

| Check | Command | Result |
|---|---|---|
| Build and typecheck | `npm run build`, `npm run typecheck` | pass, strict |
| Unit, conformance, integration | `node --test` | **284 / 284**, no todo, no skip |
| Terminology acceptance | `node --test test/unit/glossary.test.js` | **17 / 17** — the ten required scenarios, each paired with its non-overreach counterpart |
| Release gate | `./scripts/verify.sh` | **23 / 23** |
| Documentation consistency | `./scripts/check-docs.sh` | 13 governed documents, front matter, index coverage and links valid |
| Packaging | `verify.sh` phase 3b | `npm pack` → fresh profile → row composes → runtime and bundle patch present → profile-local CLI present |
| Compatibility | CI `with-host`, now required | installs and exercises **dsh 0.2.1-alpha.1**, the one release declared Verified |

**Tested versions.** Node v24.21.0; TypeScript 6.0.3 (pinned in CI and installed
locally); DSH 0.2.1-alpha.1 (Verified — the only baseline any claim rests on);
package 0.12.0; `PROMPT_VERSION` 0.5.0 with the compiled section at 2,806 bytes
against the unchanged 2,945-byte ceiling; `DOMAIN_VERSION` 1.

**Intentionally excluded, stated rather than hidden.** The behavioural gates C and D:
the `eval/` harness seeds the two arms and scores the filesystem, but its step 2 is
*"the subject is a real agent run"*, which this repository does not execute — so no
behavioural result exists for this revision and none is claimed. Locally, the host
integration tests skip rather than fail when no DSH installation is present; CI
installs the verified release, so they run there.

**Frozen evaluation baseline.** **v0.12.1**, the release whose tag records the exact
commit. v0.12.0 was superseded as the baseline because its required compatibility job
failed: the job had never installed **pnpm**, which `dsh plugin add` forwards to, so
every install step in the chain failed while `continue-on-error` hid it. v0.12.0's own
tag therefore points at a commit whose required job was red, and a baseline must be a
state that actually passed its checks. From here, any change to governance behaviour invalidates the baseline: it
must be re-frozen and the evaluation re-run, because a result measured on one
revision may not be reported as a result for another (Batch 7 §20.7).

**One reporting defect found by the newly-required CI job — since fixed (P2-1).**
`verify.sh` used to print "0 tests passed" on a non-TTY runner, because it counted `^✔`
lines while `node --test` emits TAP (`ok n - …`) when stdout is not a terminal. It now
prefers the runner's own summary (`^# pass N`) and falls back to the checkmark count, so
both modes report the true number. Verified by running the gate twice — once piped
(`| cat`) and once under a pty (`script -qec`) — both reporting **305 tests passed**.
Recorded while it was open; corrected here rather than left standing as a live defect.

**Known limitations carried forward**, each with its evidence above: Gates C and D
are unmeasured; `confirmedByUser` is asserted by the agent and cannot be
independently verified; cross-document contradiction detection is not implemented;
the CI host job depends on an upstream npm package remaining installable.

### Round 7 legacy and compatibility inventory (Phase 1)

Every candidate was classified **before** anything was removed, with the evidence
that supports the decision. `RETAIN` includes artifacts that stay because they are
required; historical documents are retained *as historical*, never as active
architecture.

| Artifact | Current role | Usage evidence | Compatibility relevance | Decision | Rationale |
|---|---|---|---|---|---|
| `src/**/*.ts` (19 files) | hand-authored runtime | built by `tsc -p tsconfig.build.json`; imported by `lib/`, tested by `test/` | host-agnostic | **RETAIN** | the single source of truth; Phase 3 verified no hand-authored runtime `.js` exists outside the shim |
| `lib/**/*.js` (19 files) | generated runtime | resolved by `main`, by `bin/ieg`, and by every integration test | required by the install model (a Git install runs no build) | **RETAIN** | generated, never hand-edited; 19 sources map 1:1 onto 19 outputs |
| `bin/ieg` | executable shim | `package.json` `bin.dsh-ieg`; invoked by the CLI checks | required by the host's bin mapping | **RETAIN** | the documented, justified exception to the TypeScript rule |
| `src/kernel/lifecycle.ts`, `src/kernel/control.ts` | IEG install/update/uninstall and the lifecycle control plane | none — absent from `src/` since 0.9.2 | none | **REMOVE** (already done, Batch 5) | a plugin cannot install itself; the host owns installation |
| `scripts/ieg-npm.sh`, `scripts/ieg-npm-lifecycle-check.sh` | npm lifecycle wrappers | still invoked by `ci.yml` while no longer existing | none | **REMOVE** | dead references in a `continue-on-error` job; the step is deleted in this round |
| `.github/workflows/ci.yml` — host pin | installs the integration host | line 76 before this round | **directly decides what is verified** | **REFACTOR** | it installed the retired `0.2.0-rc.2` while the package declared `0.2.1-alpha.1` verified; now pins the verified release and is required |
| `.github/workflows/ci.yml` / `release.yml` — toolchain install | provides `tsc` to the build, test and release jobs | every job | build and release correctness | **RETAIN (now reproducible)** | was a floating `npm install --global typescript`; R8-06 pins the version exactly in `package.json`, commits `package-lock.json`, and installs with `npm ci --ignore-scripts` in CI and the release workflow |
| `.github/workflows/release.yml` | builds release assets | runs on `release: published` | none | **RETAIN** | its example command was corrected in 0.9.2 |
| `package.json` `dsh.bundle` / `dsh.engines.dsh` / `compatibility` | installability and the declared baseline | read by the host installer and by the packaging tests | the declared baseline itself | **RETAIN** | declares `0.2.1-alpha.1` verified; the range is now documented as a compatibility statement, not a tested list |
| `scripts/verify.sh` (23 checks) | release gate | run locally and by CI | exercises a real install and mount | **RETAIN** | detects stale metadata, generated drift, missing package files and a broken install |
| `test/**` (284 tests) | regression suite | `node --test` via `pretest` | mounts the real host when present | **RETAIN** | skips rather than fails without a host |
| `eval/**` | behavioural harness and scenarios | Phase 13's instrument | host-independent | **RETAIN** | needed for the evaluation; nothing else scores outcomes from the filesystem |
| `IMPLEMENTATION-VALIDATION-HANDOFF.md` | retired pointer | referenced from README as retired | historical | **RETAIN as historical** | `status: retired`; the maintenance round proposes `DEPRECATE` for exactly this |
| `TYPESCRIPT-MIGRATION.md` | migration record | referenced by README and ARCHITECTURE | historical | **RETAIN as historical** | records the migration; its superseded modules are struck through |
| `0.2.0-rc.2` mentions in active docs | retired-baseline statements | README, PRODUCT-SPEC, PACKAGE-REFERENCE, MAINTENANCE | historical | **RETAIN** | each is explicitly marked retired/SUPERSEDED; removing them would erase why the baseline moved |
| `cordis.patch.yml`, `docs/**`, `PRODUCT-SPEC.md`, `ARCHITECTURE-SPEC-AGENT-REFERENCE.md` | configuration and active design record | referenced throughout | describes the current surface | **RETAIN** | no retired concept is described as current after the 0.9.2 and 0.11.0 passes |

No deletion was performed without a line above, and nothing removed was required by
the supported baseline.

### DSH compatibility policy (Batch 7 Phase 4)

Compatibility is stated in four states, never as a semver range:

| State | Meaning |
|---|---|
| **Verified** | installed and exercised by this repository's own checks |
| **Compatible** | believed to work, but not independently verified in the current release |
| **Unsupported** | known or declared incompatible |
| **Unknown** | insufficient evidence |

Standing: **`0.2.1-alpha.1` is Verified** — CI installs exactly that release and runs
the full verification chain against it, in a **required** job, so a compatibility
failure is a CI failure rather than a warning. The declared peer range
`>=0.2.1-alpha.1 <0.3.0` is a **compatibility statement, not a tested-versions
list**: every other version inside it is **Unknown** until a check exercises it.
`0.2.0-rc.2` is **Unsupported** — retired in the 0.8.0 re-baseline, absent from both
the peer range and the release map.

Before Round 7, CI installed `0.2.0-rc.2` while the package declared
`0.2.1-alpha.1` verified, and its host job was allowed to fail
(`continue-on-error`), so the declared baseline was never actually enforced. Both
are corrected: the job pins the verified release and is required.

## 4. Not verified — the blockers

Status as of the 0.7.0 scope-reset round (2026-10-03). A blocker marked
**closed** keeps its entry so the record of what was wrong survives.

1. **Behavioural improvement (Gate C) — BLOCKED / UNVERIFIED at the Batch 10
   baseline.** No valid measurement exists and none can be produced under current
   conditions: the method needs real control/treatment `dsh` runs, and no rubric has
   been frozen, `eval/runs/` does not exist, the harness does not execute a subject,
   and no non-English scenario exists. No equivalent method was adopted, because every
   candidate is a Batch 10 §6-prohibited substitution (the register lists each one).
   *Unblock:* an operator-driven run at the frozen baseline — rubric frozen first, ≥8
   repetitions per arm per scenario across four families, ≥2 models, one non-English
   scenario, blind judging.
2. **Information integrity (Gate D) — BLOCKED / UNVERIFIED at the Batch 10 baseline.**
   The capability is implemented and tested in the real runtime path (R8-02), but
   *implemented is not measured*, and the dedicated invalidated-information scenario
   does not exist. One boundary must travel with any future result: IEG has no
   read-time enforcement, because the host freezes tool results, so a measurement can
   evidence write-time invalidation and reintroduction control only.
   *Unblock:* as Gate C, plus that scenario.
3. **Packaging (Gate I) — closed in Batch 10 (P0-02 enforcement).** The clause that
   was unmet was "peer-range enforced": the range was declared only under
   `dsh.engines.dsh`, which the host never reads, so an out-of-range host was not
   refused. The range is now also declared in `peerDependencies`, the field the host's
   `evaluatePluginCompatibility` actually enforces (it throws for a profile bundle and
   returns a denial reason for a plugin row). The peer is declared **optional** (`peerDependenciesMeta`) so npm does not try to install the host itself: DSH supplies the host, and the host's check reads `peerDependencies` only, never the npm meta. Evidence at this baseline: the host's own
   evaluator returns *compatible* for this manifest and **refuses** an out-of-range
   declaration with the exact-version exemption remedy; `verify.sh` phase 3b still packs,
   installs into a fresh profile and composes the row; and `packaging.test.js` keeps the
   enforced range and the documented one from drifting apart. The earlier sentence here
   that `"private": true` remained was stale — `package.json` has no `private` field.
   Publication and §34.2 Q5 remain release authorization for Batch 11, and are **not**
   among the gate's four conditions.
4. **The compatibility baseline for the installed host — closed in 0.8.0.** The
   declared peer range is now `>=0.2.1-alpha.1 <0.3.0`, and
   `dsh.compatibility.dshReleases` records `0.2.1-alpha.1` as `verified`.
   `lib/compatibility-baseline.json` was re-captured against the installed host
   and reviewed; the ordered section names, the host prompt hash (`ceb63ee5`) and
   the required capability set are identical to the previous baseline, so the
   prompt surface is semantically unchanged. The retired `0.2.0-rc.2` baseline is
   **SUPERSEDED** (closes §34.2 Q7 in the architecture spec).
5. **`user-attention` behavioural validation — withdrawn, no longer a blocker.**
   This entry previously recorded a headless measurement block for the
   `user-attention` module and its scripted answerer. The module, failure class
   `FC-2.4`, the question ledger/gate, and the evaluation-only answerer were
   removed in 0.7.0 (classification: Out of Scope / Externally Solved; §13). There
   is no residual blocker and no measurement owed.
6. **Diagnostics are invisible — closed.** The ring, the `ieg:status` line, and
   the read-only `ieg_status` tool report mount, configuration, last denial, and
   the compatibility verdict without a logger exporter, verified against the real
   `dsh-system-prompt` and `dsh-tools`.
7. **No compatibility adapter — closed.** `lib/kernel/compatibility.js` observes
   the real `system-prompt/assemble` waterfall and classifies a verdict against a
   committed baseline, so a host upgrade becomes visible.
8. **False positives unmeasured — closed in simulation.** A 21-call legitimate
   corpus plus the declared traps measures `false_block_rate = 0` and catches all
   traps (`test/integration/gate-precision.test.js`). Confirmation with real
   agents still requires a model run.
9. **Intrusive defaults chosen unilaterally — closed.** `requireBeforeMutation`
   defaults to `false` in `lib/kernel/config.js` and in the shipped
   `cordis.patch.yml` row, so the first write of a session is governed by the
   workspace policy alone; strict mode is an explicit opt-in. The residual is
   narrower and policy-level, not a default: `overlapCheck: 'ask'` still degrades
   to denial where no approval channel exists (the fail-closed path), which is why
   the evaluation arms its gates explicitly.

### Gates C and D — the measurement attempt, and its exact blocking condition

Batch 10 requires a blocked gate to record not only why it is blocked but what was attempted.
The attempt was **executed** at this baseline; none of what follows is inferred.

| # | Command | Result |
|---|---|---|
| 1 | `command -v dsh` / `dsh --version` | `/usr/local/bin/dsh`, `0.2.1-alpha.1` |
| 2 | `DSH_HOME=$PWD/.ieg-verify/eval-home dsh --profile evalheadless --from-default-profile headless --dump-config` | isolated profile created, exit 0 |
| 3 | `DSH_HOME=… dsh plugin --profile evalheadless add "file:$PWD"` | plugin added, exit 0 |
| 4 | `DSH_HOME=… dsh --profile evalheadless headless "Reply with the single word OK."` | **exit 1, fails before any agent turn** |

The decisive error, verbatim:

```
dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official";
store DEEPSEEK_API_KEY through the credentials service (the web Models page writes it),
or export DEEPSEEK_API_KEY in the launching environment
```

So the launcher, an isolated profile and the plugin install all work; **the agent run itself
cannot start**. No operator-supplied credential exists — `DEEPSEEK_API_KEY`, `DSH_API_KEY`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `IEG_EVAL_CREDENTIALS` are all unset, no credential
path was named, and the live profile and `~/.dsh` were deliberately not consulted.

**Why no partial evidence was produced.** The harness's `seed` step writes into `eval/runs/`,
which the method designates as evidence rather than scratch space; with no subject to act,
`measure` would compare the tree against its own seed and report nothing created, modified or
deleted — a zero-signal artifact that *reads like a clean result*. Producing it would be the
manufactured evidence Batch 10 §6 prohibits, so no run and no result were created. `eval/runs/`
remains absent.

**A second, previously unrecorded blocker.** The plugin under test is mounted in the session
that would run the measurement, so IEG's own mutation gate governs the measurement's writes:
with the shipped default `workspace.policy: ask` and no approval channel, `write`, `edit` and
any shell command carrying a redirect or writing verb are refused
(`ieg.workspace_mutation_blocked`, outcome `gated`). Even authoring a scratch harness is
therefore unavailable without an approval channel or `policy: allow` for that session — the
advisory boundary already documented in `SECURITY.md`, observed live.

**Unblock conditions — all must hold for a trustworthy Gate C/D result:**

1. an operator-supplied model credential, exported in the launching environment or named as a
   credentials-file path (`IEG_EVAL_CREDENTIALS`);
2. an approval channel, or `workspace.policy: allow` for the measurement session, since the
   gate fails closed on the writes every run needs;
3. protocol prerequisites that do not exist yet: a rubric artifact frozen **before** any run, a
   blind-judge procedure, repetitions raised from the default 3 to ≥8 across all four scenario
   families, a ≥2-model parameter or route in `eval/`, and one non-English scenario;
4. for Gate D additionally, the dedicated invalidated-information scenario.

### Batch 10 unresolved / conflict register

Issues that Batch 10 cannot conclusively resolve, each with its classification and the
record it requires. Nothing here is silently converted into a pass.

| Item | Classification | Record |
|---|---|---|
| Gates C and D lack trustworthy current evidence | Validation blocker | Reason and unblock condition in §4.1 and §4.2; terminal status **Blocked / Unverified** in the §3 register |
| No valid equivalent validation approach exists for C or D | Validation blocker | Original condition, the nine attempted alternatives and the Batch 10 §6 prohibition each violates, all in the §3 register |
| Eight contradicted current-state claims (versions, `PROMPT_VERSION`, counts, check-list, gate vocabulary, stale backlog item) | Information-integrity issue | Authoritative evidence and the corrected state, corrected in commit `8ae376a` and listed in that commit; an independent audit produced the original list |
| Batch 10 regression: `npm ci` went red after the peer-range declaration | **Batch 10 defect — corrected** | Affected change: the `peerDependencies` declaration (`bbd66109`) left `package-lock.json` out of sync, failing the immutable install step in four CI jobs. Correction: `peerDependenciesMeta["@deepseek-ai/dsh"].optional` plus a regenerated lockfile (`62939c3`); affected verification re-run: `npm ci` PASS, 306/306 tests, 24/24 checks |
| Ambiguous `.tgz` artifact | Cleanup blocker | **None.** The single artifact is unambiguously 0.12.1 and protected, so no file required a judgement call (§12) |
| Peer-range enforcement gap (Gate I clause 4) | **Resolved in Batch 10** | Enforced by declaring the range in `peerDependencies`; the host's own evaluator returns *compatible* for this manifest and refuses an out-of-range declaration. Kept here as a closed entry so the record of what was wrong survives |
| `CHANGELOG.md`'s `[0.12.1]` entry says the non-TTY count defect was "recorded, not yet fixed" | Deferred defect (historical record) | Faithful to what shipped in 0.12.1; the fix landed in Batch 9. Rewriting it would falsify release history, which Batch 10 §8 forbids |
| R8-05 `src/index.ts` decomposition unfinished (826 lines, 7 host modules) | Deferred defect | Explicitly out of Batch 10 scope ("TypeScript decomposition or architectural cleanup"); no half-extracted code, tree green |
| No model credential is available to a measurement session | Validation blocker | Executed: a headless run exits 1 with `MISSING_CREDENTIAL` before any agent turn; every candidate credential variable is unset and none was operator-named (§4 attempt table). Unblock: the operator supplies one |
| IEG's own gate refuses the scratch writes a measurement needs | Validation blocker | Executed: `ieg.workspace_mutation_blocked`, outcome `gated`, on `write`/`edit`/redirect shell commands, because `policy: ask` has no approval channel in the measurement session. Unblock: an approval channel, or `policy: allow` for that session |
| The `aea534c` CI failure's per-job cancellation mechanism | **Verified in Batch 10** | Re-queried by API: `Node 20`, `Node 24` and the required verified-host job ran 19:54:46Z → 20:09:47Z with **no runner ever assigned**, while `documentation health` and `Node 22` obtained runners and passed. That is the 15-minute queued-job timeout, observed rather than inferred |
| The claim that the host enforces only `peerDependencies` | **Verified in Batch 10 by execution** | The host's own exported `evaluatePluginCompatibility` was run: it accepts this manifest on runtime `0.2.1-alpha.1` and **refuses** an out-of-range declaration with the exemption remedy. What remains unexecuted is an out-of-range *install* (only one host version exists here) |
| Local `origin/main` remote-tracking ref is stale | Local environment, not a repository defect | `git status -sb` can report a large "ahead" count while pushes succeed; GitHub's API is the remote truth. No fetch was run under the read-only audit |

## 5. Architecture map

`src/**/*.ts` is the source of truth; `lib/**` below is the committed `tsc` build
output of it (see [`TYPESCRIPT-MIGRATION.md`](TYPESCRIPT-MIGRATION.md)). The tree
shown is the **built** runtime the host actually loads.

```text
lib/
├── index.js              Cordis entry: section, listeners, tool registration, wiring
├── contract.d.ts         ambient seam contract — the ONLY record of host API shapes
├── kernel/
│   ├── config.js         strict config validation (plain object, no schema lib)
│   ├── registry.js       module contract, enablement, dependency/conflict resolution
│   ├── prompt-compiler.js one section, dedupe, budget, interpolation safety
│   ├── orientation.js    orientation store + record_orientation tool
│   ├── overlap.js        document-overlap detector (body / H1 / filename subject)
│   ├── durability.js     ctx.storageDomain persistence, fails open
│   └── compatibility.js  host assembly observation + verdict
└── modules/              the three governance modules (pure logic + descriptor)
```

The corresponding sources are `src/index.ts`, `src/kernel/*.ts`, and
`src/modules/*.ts`; `bin/ieg` is the host-required executable shim and the CLI
source is `src/bin/ieg.ts`.

Seams actually bound:

```text
system prompt      ctx.systemPrompt.section()        advisory, never `complete`
status line        ctx.systemPrompt.context()        advisory (`ieg:status`)
step admission     agent/pre-step                    veto
orientation tool   record_orientation (registered)   capture
orientation gate   tools/pre-execute                 deny until recorded
mutation gate      tools/pre-execute                 ask / deny
overlap gate       ctx.fs scan + tools/pre-execute   ask / deny
mutation backstop  ctx.tools.guard()                 deny only, monotonic
durability         ctx.storageDomain                 per-session orientation
compatibility      system-prompt/assemble            observe only, must call next()
prompt CLI         dsh-ieg prompt | prompt edit       operator (no install surface; Batch 5)
```

There is **no question ledger and no `record_question` tool**: that seam was
removed with `user-attention` in 0.7.0.

## 6. Configuration surface

The authoritative key/value documentation is
[`docs/PACKAGE-REFERENCE.md`](docs/PACKAGE-REFERENCE.md) §Configuration; the validator in
`lib/kernel/config.js` is the executable truth. Top-level keys:

```text
enabled  sectionOrder  modules  workspace  preStep
prompt  diagnostics  diagnosticsExport
```

`userAttention` was **removed** in 0.7.0 and is now **rejected as an unknown
key**. Defaults a maintainer must not change silently: `workspace.policy: ask`
`workspace.overlapCheck: ask`, `workspace.classifyShellCommands: true`
`preStep.orientationGate: off`, `preStep.requireBeforeMutation: false`
`diagnostics: true`, and `prompt.mode: compiled`. Non-intrusive defaults are the
documented decision; strict enforcement is an explicit opt-in.

The operator's `prompt.md` is a separate input, not
config: its record lives at `$IEG_STATE_FILE` (else
`<state-dir>/ieg/state.json`, `<state-dir>` = `$XDG_STATE_HOME` or
`~/.local/state`), with a sibling `prompt.md`. Prompt precedence:
control-plane `prompt.md` > config `prompt.file` (mode `replace`) > config
`prompt.append` (mode `append`) > the compiled default.

## 7. Environment and process gotchas

These each cost real time. Do not rediscover them.

- **A delegated agent has no approval channel, so the default policy denies its
  writes.** With `workspace.policy: ask` (the shipped default) the mutation gate
  returns `ask` and the host resolves it through `ctx.approval`. A Lead session in
  the Web GUI has an answerer; an Agent-Teams teammate or subagent session does
  not, so the gate fails closed and **every** `write`/`edit` it attempts is
  refused with `ieg.workspace_mutation_blocked` — while the run looks like a
  mysterious stall rather than a policy decision. Observed live on 2026-10-03: a
  delegated session recorded its orientation correctly, passed the overlap check
  and was still denied on every write, and it correctly refused to route around
  the gate. Either perform delegated file work in a session with an approval
  channel, or give the delegated session `workspace: { policy: allow }` for the
  duration. There is no per-agent pause: `enabled: false` in the row config disables
  IEG for that whole profile, and every agent in it. This is the documented fail-closed path working as
  designed, not a defect — but it is the first thing to check when a teammate
  produces nothing.
- **`ieg_status` must render content or it is silently useless.** A tool whose
  `render` returns no blocks succeeds, records its call, and shows the caller
  nothing; and because tool registration is guarded, an invalid `output.schema`
  removes the tool without failing the mount. Both happened (`0.9.0` fixes them);
  a read-only tool needs a test that asserts its **rendered** content, not just
  its canonical value.
- **`dsh plugin --profile <name> <args…>` forwards every argument to pnpm.** Any
  launcher flag placed after `plugin` reaches pnpm and fails with
  `error: unexpected argument '--from-default-profile'` followed by
  `Usage: pnpm [OPTIONS] <COMMAND>`. Profile creation therefore reads
  `dsh --profile ieg-test --from-default-profile headless --dump-config` — with
  no `plugin` subcommand. This error was reported by the first volunteer because
  `TESTING.md` documented the wrong form; the docs were corrected, and
  `scripts/check-install.sh` now checks the install end to end.
- **A profile links the plugin at install time.** Re-running validation after a
  source change silently exercises the *old* code. This produced a misleading
  result once. `eval/e2e.mjs` re-installs before running; do the same for any
  manual re-validation.
- **`ctx.logger` prints nothing** in stock compositions. Debug through behaviour
  and session logs, not log output.
- **Session logs are multi-frame zstd.** `zstdDecompressSync` decodes only the
  first frame and yields a single header event. Split on the magic
  `0x28 0xB5 0x2F 0xFD` and decode each frame — `eval/e2e-analyze.mjs` does this.
- **`ctx.fs` throws when the service is absent**; `ctx.get('fs')` returns
  `undefined`. Always use `ctx.get`.
- **Ordering must come from `tool/call` events.** Text search matches tool
  schemas in each request header, which precede every call.
- **`node --test` rejects a directory argument** (`node --test test/` fails).
  Use auto-discovery or a glob.
- **pnpm hard-links change inode ctime**, so the file-edit guard may demand a
  re-read of a file you just edited. Re-read, do not fight it.
- **Every `dsh` command needs `DSH_HOME` exported** to target an isolated home.
  `IEG_DSH_PACKAGES` points the test loader at a non-default DSH install, and
  `IEG_VERIFY_HOME` relocates the verification chain's throwaway home.
- **The live `~/.dsh` was never used** by any IEG install or evaluation. Profiles
  `iegh`, `iegv`, `iegverify` (`.ieg-verify/`) and `iege2e` (`.ieg-e2e/`) are all
  throwaway. IEG does appear in this session's own session-cache files under
  `~/.dsh/storages/`, because evaluation subagents ran inside this session — that
  is session history, not an install.
- **The plugin list shows the profile you are *running*, not the one you installed
  into.** Installing into `ieg-test` while the harness runs `web` looks exactly
  like a failed install. The package, the manifest reference, and the composed
  `ieg` row are all per profile; `scripts/check-install.sh <profile>` reports
  which of the three states you are in. `dsh --profile <name> --dump-config`
  needs **write** access to that profile directory (it materialises a temporary
  `cordis.yml`), so a sandboxed or read-only `DSH_HOME` yields "unverified" rather
  than a false negative.
- **`ignorable`** — a plugin-owned session event cannot carry the envelope's
  `ignorable` marker, so a log written with IEG loaded cannot be reconstructed
  without IEG. This is why durable state uses `storageDomain` rather than
  `session.append`. See the architecture spec's Part A durable-state seams.

## 8. Ranked backlog

1. **Regenerate the behavioural evidence (Gate C)** — a fresh `eval/` run with a
   frozen rubric and a blind judge, against the current three-module prompt.
2. **Measure information integrity (Gate D)** — the invalidated-information
   scenario, scored on whether invalidated information stops being reused as
   authoritative.
3. **False-positive confirmation with real agents** — the simulated matrix shows
   `false_block_rate = 0`; only a model run can confirm it beyond the matrix.
4. **Packaging close-out (Gate I)** — `private` is already absent (Batch 10 §4.3);
   the remaining clause is "peer-range enforced", which is declared but not enforced
   (§4.3). Batch 11 decides to enforce it or to re-scope the clause. Publication and
   the publish target are release authorization, not gate conditions.
5. **Orientation Consistency direction** — named terminology only (declared
   constraints → observed actions → consistency/drift evaluation). **Not
   implemented in this batch**; do not build or promise it without a scope
   decision.
6. **Retrieval-eligibility semantics** — named terminology only (existence
   status, authority, provenance, supersession, retrieval eligibility). **No
   retrieval system is built in this batch.**

## 9. Decisions waiting on the user

Consolidated in `ARCHITECTURE-SPEC-AGENT-REFERENCE.md` Part B (§34.2). **Decided:**
the non-intrusive defaults, the `ask`-only gate with no IEG-registered answerer
and deferring to `dsh-agent-instructions`. **Closed in 0.8.0:** the compatibility
baseline re-capture (§4 item 4, Q7) and the module descriptor versions (Q9).
**Still open:**

- **Section order `8500`** — the code ships it and a regression test fixes it
  but the value itself is still to be confirmed as final (§34.2 Q2).
- **Publish target** — registry, git, or local `file:` distribution for the
  package once Gates C and D pass (§34.2 Q5).
- **Live-profile rollout** — whether IEG is ever installed into the live `web`
  profile (§10), and under what conditions; it currently is not (§34.2 Q6).
- **Control state is per-user, not per-profile** — `$IEG_STATE_FILE` /
  `$XDG_STATE_HOME` resolves once for the whole user, so two profiles on one host
  share one governance switch. Decide whether that is intended or whether the
  control file must become profile-scoped (§34.2 Q8).

## 10. Why IEG does not appear in the plugin list

IEG is installed **only** into throwaway profiles under isolated `DSH_HOME`
directories. The plugin list in a live app reflects the **live `web` profile**
(`DSH_PROFILE=web`, `~/.dsh/profiles/web`), whose bundle list contains
`dsh-base`, `dsh-web-app`, and `dsh-experimental-agent-team-profile` — no IEG.
That absence is deliberate: it kept the evaluation from touching a working
environment.

Two further reasons it would not appear anywhere else:

- the package is publishable but not published, and installed from a local `file:` path, so it
  is not in any registry or marketplace inventory;
- it is discovered through a profile's own manifest and bundle patch, so it
  appears only after being added to that profile.

To install it into the live profile (**not recommended while §4 is open**):

```bash
dsh plugin --profile web add file:<repository root>
```

## 11. Resolved: `dsh-free-search` removal

**Confirmed by the user as their own action.** The live `web` profile no longer
references `dsh-free-search` — absent from `dsh.profile.bundles`, from
`dependencies`, and from `node_modules`; manifest modified `2026-10-01 10:55:55`.

No IEG install or evaluation touched the live profile: every invocation exported
an isolated `DSH_HOME`. Recorded here so a future maintainer does not
re-investigate it as a side effect of this work.

## 12. Workspace layout and regeneration

### Batch 10 legacy-artifact inventory, removal record and boundary audit (B10-P1-01, B10-P2-01)

**Inventory — complete, including ignored and untracked files, `node_modules` excluded.**

| Path | Version | Tracked | Regenerable | Referenced by a tracked file or workflow | Class | Deleted |
|---|---|---|---|---|---|---|
| `.ieg-verify/pack/dsh-information-environment-governance-0.12.1.tgz` | 0.12.1 | no (ignored) | yes — `verify.sh` regenerates it with `npm pack` | no | **0.12.1 or later** | **no — protected** |

**Removal record: empty.** No `.tgz` in the workspace is a 0.12.0-or-earlier installation
package, so Batch 10's deletion authority was **not exercised**. The single `.tgz` present is
the current version, produced by the release gate and gitignored. No file was deleted, no
`git rm` was issued, and no history, tag, release metadata or release asset was touched. The
`0.12.1` tarball attached to GitHub release `v0.12.1` is a separate protected release asset,
not this scratch copy.

**Post-cleanup verification:** the workspace contains no 0.12.0-or-earlier `.tgz` — and
contained none before the inventory either; no current-version or required artifact was
removed; the build, test and packaging workflows remain functional (final regression below).

**Independent boundary audit (B10-P2-01).** A separate read-only reviewer was given the same
task and *not* my numbers, and reproduced the boundary independently. The two accounts agree:

- **one** `.tgz` in the entire workspace, version 0.12.1, untracked and gitignored,
  regenerated by `verify.sh` during the audit, referenced by no tracked file → **0 files
  qualify for deletion**;
- protected classes all present and unmodified: 26 tracked `src` files, `package.json`,
  `cordis.patch.yml`, both `tsconfig` files, `package-lock.json`, 15 tracked documents (13
  governed), 54 tracked `lib` files with the `src`↔`lib` drift check passing, `bin/ieg`
  executable, **12 local tags matching the 12 remote tags**, 12 GitHub releases all marked
  `prerelease`, and **no `v1.0.0` tag or release**;
- every `.gitignore` reintroduction pattern holds, checked with `git check-ignore`:
  `.ieg-verify/`, `.pnpm-store/`, `.ieg-e2e/dsh-home/`, `.env`/`.env.local`, `*.tgz`,
  `id_rsa`, `.credentials.yaml`, `eval/runs/`, `node_modules/`;
- the independent reviewer also confirmed the frozen baseline's package version and
  `PROMPT_VERSION` by reading `package.json` and `src/index.ts` directly, and found **no
  incorrect figure** in the baseline table.

**Two limits on this audit, both since resolved by execution.** The reviewer confirmed the
`aea534c` CI run's *failure* conclusion but not its per-job cancellation mechanism, and left
the host's peer-enforcement claim resting on static inspection. Batch 10 then re-queried the
run's jobs (three jobs cancelled after exactly fifteen minutes with no runner assigned) and
executed the host's own `evaluatePluginCompatibility` against this manifest. Both are now
recorded as verified in the §4 unresolved/conflict register.

The tree is trimmed to sources, documents, and regenerable scaffolding. Its size
is deliberately not recorded here: it is dominated by regenerable artifacts and
changes with each run — measure it with `du -sh .` instead of trusting a number.

```text
├── README.md                             entry point and evidence-chain summary
├── PRODUCT-SPEC.md                       positioning, scope, success criteria
├── ARCHITECTURE-SPEC-AGENT-REFERENCE.md  architecture; Part A seams, Part B design, §32 gates
├── IMPLEMENTATION-VALIDATION-HANDOFF.md  retired pointer to §32 and the build order
├── MAINTENANCE-HANDOFF.md                this file — current status and numbers
├── TESTING.md                            volunteer install, trial, and deviation reporting
├── SECURITY.md                           boundaries, known limitations, reporting
├── CONTRIBUTING.md                       process contract and the checks to run
├── CODE_OF_CONDUCT.md                    Contributor Covenant 2.1
├── CHANGELOG.md                          release history (pre-0.7.0 keeps the ABG name)
├── TYPESCRIPT-MIGRATION.md               build model, exceptions, migration history
├── scripts/                              check-install.sh, check-docs.sh, verify.sh
├── docs/                                 documentation index and package reference
├── package.json / cordis.patch.yml       the DSH bundle manifest and patch — the root is the package
├── src/                                  TypeScript source of truth (kernel, three modules, CLI)
├── lib/                                  compiled runtime emitted from src/ (committed; no lib/generated/)
├── bin/ieg                               host-required executable shim
├── test/                                 unit, conformance, and integration suites
├── test-support/dsh.js                   real-distribution test loader
├── eval/                                 behavioural and end-to-end evaluation
│   ├── README.md                         method, metrics, process lessons
│   ├── harness.mjs                       seed | prompt | measure | list
│   ├── scenarios.mjs                     seeded scenarios and task prompts (four scenarios)
│   ├── e2e.mjs                           real-agent runs, re-installs first
│   └── e2e-analyze.mjs                   ordering derived from tool/call events
├── .ieg-e2e/                             end-to-end overlays + throwaway DSH home
├── .ieg-verify/                          verify.sh's throwaway home and logs
└── .pnpm-store/                          pnpm content-addressable store (regenerable)
```

`eval/runs/` is created by a run rather than stored with the method:
[`eval/README.md`](eval/README.md) holds the method and the metric definitions
not numbers. The JSON outputs of a run (`e2e-results.json`, `e2e-analysis.json`)
are transient for the same reason — a stale copy of a derived artifact reads as a
standing record.

**Regenerable artifacts — regenerate rather than keep:**

| Artifact | Recreate with | Cost |
|---|---|---|
| `.ieg-verify/` throwaway home + test logs | `scripts/verify.sh` (honours `IEG_VERIFY_HOME`) | free |
| `.ieg-e2e/dsh-home/` throwaway profile | [`eval/README.md`](eval/README.md) | free |
| Staged credentials inside that home | [`eval/README.md`](eval/README.md) | user-authorized only |
| A sandbox's **initial** state under `eval/runs/` | `node eval/harness.mjs seed <scenario> <arm> <rep>` | free |
| A sandbox's **recorded end state** | a real agent run | model calls |

**Removed in prior hygiene passes, and why:**

- A previous `.ieg-e2e/dsh-home/` held a **copy of the user's credentials** and a
  profile whose linked plugin copy was stale, i.e. exactly the trap in §7. Both
  are reasons to regenerate rather than keep.
- `.ieg-verify/` (952 KB) — throwaway; `verify.sh` recreates it.
- `.pnpm-store/` — created at the repository root by `dsh plugin add` inside
  `verify.sh`. **Fixed at the source**, not just deleted: the script tears the
  store down on exit, explicitly as well as via a trap, because `dsh` spawns pnpm
  with its own environment so an exported `store-dir` never reaches pnpm.
- Superseded evaluation sandboxes, verbatim agent answers, and behavioural result
  tables in `README.md`, `docs/PACKAGE-REFERENCE.md`, and `eval/README.md`. They were
  deleted rather than annotated, because an annotated stale number still reads as
  a standing result.

**Kept deliberately:** `.ieg-e2e/ieg-config.yml` and `ieg-off.yml` — the treatment
and control overlays. They are configuration, not results, and a re-run needs
them.

## 13. HISTORY

> **This section is history.** It records changes that readers of older material
> will still encounter. Nothing here is a current capability.

### 13.1 Rename — ABG to IEG (0.7.0)

Before 0.7.0 the project was `dsh-agent-behavioral-governance` ("ABG"), with the
`abg` terminal command. **0.7.0 renamed it** to
`dsh-information-environment-governance` ("IEG"), with the `dsh-ieg` terminal
command. Pre-0.7.0 [`CHANGELOG.md`](CHANGELOG.md) entries
deliberately keep the old name, because a changelog is immutable history; reading
"ABG" or `abg` in an old entry is expected, not a defect.

### 13.2 Withdrawn capability — `user-attention` / `FC-2.4` (0.7.0)

The `user-attention` module and failure class `FC-2.4` (fragmented user
questioning) were **removed in 0.7.0**. Classification: **Out of Scope /
Externally Solved**. Testing found a stable prompt-level solution, so runtime
governance is no longer justified. It was **not** a failed feature.

Removed with it: the per-agent question ledger, the question batcher/gate, the
read-only question tool, the runtime-context question surface, the
`userAttention` configuration key (now rejected as unknown), and the
evaluation-only scripted question answerer plus the question-consolidation
scenario. Pre-0.7.0 CHANGELOG entries keep the historical name.

### 13.3 Acceptance-gate renumbering (0.7.0)

The withdrawn user-attention gate (old **D**) was removed, the letters after it
shifted down, and the set now runs **A–J with no gap**. Old → new:

```text
old E -> D      old F -> E      old G -> F      old H -> G
old I -> H      old J -> I      old K -> J
old D (user-attention efficiency) -> withdrawn
```

### 13.4 Module history

- **`child-agent-lifecycle` / `FC-2.5`** was planned as a fifth module and
  **withdrawn** by explicit user decision in the v0.2.0 round: the benefit did
  not justify the workload, a populated child list is expected on a healthy
  system, and the evaluation harness contained no delegation scenario. Its
  module, listeners, contract types, prompt fragment, tests, and product clauses
  were removed, and remaining identifiers were renumbered. The plugin then
  shipped **four** modules.
- **0.7.0** removed `user-attention` (§13.2), leaving the current **three**.

### 13.5 The `0.1.0` and v0.2.0 rounds

- **`0.1.0` (2026-10-01)** — the initial prototype: kernel, prompt aggregation
  module registry, and the first enforcement seams, with a 159-test evidence
  chain recorded verbatim in the CHANGELOG. Its build order and validation cases
  lived in [`IMPLEMENTATION-VALIDATION-HANDOFF.md`](IMPLEMENTATION-VALIDATION-HANDOFF.md)
  which is now a retired pointer to the maintained homes.
- **v0.2.0** — the "operable and reviewable" round: scope-isolated per-agent
  state (Gates E/G here; F/H in the old letters), four-channel diagnosability
  (Gate F here; G old), the compatibility adapter (Gate H here; I old)
  gate-precision simulation, and the packaging groundwork. Its phases and gate
  matrix are in [`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
  Part B. The earlier 265-test 0.5.x structural round and 238-test v0.2.0 round
  are recorded in CHANGELOG history.
- **0.6.0** — the control-plane round: the Web panel and in-harness issue
  reporting were removed and replaced by the terminal interface (then `abg`)
  the control record, and `prompt.md`. Its `PROMPT_VERSION` was unchanged because
  the compiled governance text was identical.
- **0.8.0 (2026-10-03)** — the **DSH migration and packaging round** (the
  repository root became the installable package; `plugin/` was removed; the host
  baseline moved to `0.2.1-alpha.1`; the runtime finished migrating to TypeScript;
  the retired `lib/generated/` output directory was removed). `PROMPT_VERSION` was
  **unchanged at 0.3.0** and the compiled text **byte-identical** in that round
  deliberately did **not** optimize the prompt. The structural regression
  `test/integration/packaging.test.js` was added, and `bounded-repair` (OBJ-3)
  completed the evaluation scenario set.

### 13.6 Open-item (Q) closures — no renumbering (0.8.0)

`ARCHITECTURE-SPEC-AGENT-REFERENCE.md` §34.2 keeps its Q numbering. Two items
closed in 0.8.0 and remain listed there as **decided** (the same convention as
Q1/Q3/Q4), so no number disappeared and none was renumbered:

```text
Q7  compatibility baseline re-capture      -> CLOSED (single baseline 0.2.1-alpha.1)   §34.2, §4 item 4
Q9  module descriptor version fields       -> CLOSED (descriptors now 0.2.0)           §34.2, §24
Q2  section order 8500                     -> still OPEN
Q5  publish target                         -> still OPEN
Q6  live-profile rollout                   -> still OPEN
Q8  control state per-user vs per-profile  -> still OPEN
```

## 14. Batch 11 release-readiness handoff

**v1.0.0 was NOT released in Batch 10.** No tag, no GitHub release, no publication, no release
asset was created or uploaded, and no release authorization was modified. The release boundary
held.

### Technical validation status — frozen Batch 10 baseline

Baseline: commit `a71a440` (validation target), package `0.12.1`, `PROMPT_VERSION` `0.5.0`,
verified DSH `0.2.1-alpha.1`.

| Gate | Terminal status |
|---|---|
| A, B, E, F, G, H, J | **Passed — Evidence Complete** |
| C (behavioural improvement) | **Blocked / Unverified — Evidence Insufficient** |
| D (information integrity) | **Blocked / Unverified — Evidence Insufficient** |
| I (packaging) | **Passed — Evidence Complete** — Batch 10 closed clause 4 by declaring the range in `peerDependencies`, which the host enforces |

Evidence: the gate evidence register (§3), the blockers and their unblock conditions
(§4.1–4.3), and the independent boundary audit (§12).

### Release authorization status — deliberately separate

The package is publishable but **not published**. Independently confirmed: the npm registry
returns `E404` for this package name, all 12 GitHub releases are marked `prerelease`, and no
`v1.0.0` tag or release exists. The publish target remains undecided (§34.2 Q5).
**Technical validation does not authorize release**, and a validated repository must not be
described as released.

### Final engineering state at the end of Batch 10

- package `0.12.1`, `PROMPT_VERSION` `0.5.0`, `DOMAIN_VERSION` 1, zero runtime dependencies, Node `>=20`;
- final regression: typecheck 0 errors, **305/305 tests**, **24/24 `verify.sh` checks**
  (including phase 3b: the real tarball installed into a fresh profile and the `ieg` row
  composed), `check-docs.sh` green over 13 governed documents;
- CI green on the pushed commits, including the required verified-host job. Two intermediate
  commits went red on the immutable-install step after the peer-range declaration left the
  lockfile out of sync; the regression was found by that chain, corrected (`62939c3`), and the
  next run was fully green;
- workspace cleanup: **nothing qualified for deletion**; the single `.tgz` present is the
  current version, gitignored and regenerated by the release gate.

### Required Batch 11 actions

1. **Decide Gates C and D.** The measurement was **attempted** at this baseline and could not
   start: a headless run exits 1 with `MISSING_CREDENTIAL` before any agent turn, no
   operator-supplied credential exists, and IEG's own gate refuses the scratch writes a run
   needs (§4 attempt table). Four conditions must all hold before a trustworthy result is
   possible — a credential, an approval channel or `policy: allow`, the missing protocol
   prerequisites (rubric frozen first, ≥8 repetitions across four families, ≥2 models, one
   non-English scenario, blind judging), and for Gate D the invalidated-information scenario.
   Then re-validate on the revision that will be released. **v1.0.0 must not be described as
   behaviourally validated until that exists.**
2. **Gate I needs no further decision.** Its fourth clause was closed in Batch 10 by
   declaring the range in `peerDependencies`, so the host's own check fires and an
   out-of-range plugin is refused. Publication remains the only packaging action, and it is
   taken under item 3.
3. **Decide the publish target** (§34.2 Q5) and, if publishing, execute the release workflow.
4. **Re-freeze a Batch 11 baseline.** Any behaviour-affecting commit changes the frozen
   target in §3, and the affected gates must be re-validated rather than inherited.
5. **Handle the version bump and changelog** for v1.0.0. Batch 10 changed no version; the
   package is still `0.12.1`.

### Must not be inherited as settled

- Gates C, D and I are **not** passed; no document may imply otherwise.
- The DSH peer range is now **declared and enforced** through `peerDependencies`; what
  remains unobservable is prompt-surface drift, which the adapter detects by seam facts.
- IEG has **no read-time enforcement**: the host freezes tool results, so enforcement is
  write-time and retrieval-time marking is impossible by design.
- Gates A, B, E, F, G, H and J pass on the evidence named in the register; they say nothing
  about behavioural improvement.
