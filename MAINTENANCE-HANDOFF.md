---
doc_type: maintenance-handoff
project: information-environment-governance
plugin_version: 0.12.1
version: 0.8.0
status: active
owner: maintainers
last_reviewed: 2026-10-03
revision: 0.12.1-batch-7
host_baseline_verified: dsh-0.2.1-alpha.1
supersedes: none
language: en
---

# IEG Maintenance Handoff

> **This is the maintained status record (package 0.8.0).** §3–§4 are the single
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

**Mechanisms — 3 modules, 2 model-facing tools.** The plugin ships
`project-governance` (`FC-2.1`), `information-integrity` (`FC-2.3`), and
`workspace-governance` (`FC-2.2`), all enabled by default, and registers exactly
two model-facing tools: `record_orientation` and `ieg_status`. It compiles
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
reads as a standing result. **Gates C and D are therefore unmet for the current
revision**; a fresh `eval/` run with a rubric frozen beforehand and a judge that
does not see the arm is what produces a valid number.

**Acceptance gates (A–J).** Renumbered in 0.7.0 after the withdrawal of the
`user-attention` gate; the old→new mapping is in §13. The maintained table is
[`ARCHITECTURE-SPEC-AGENT-REFERENCE.md`](ARCHITECTURE-SPEC-AGENT-REFERENCE.md)
§32.1; the summary is:

| Gate | Statement | Status |
|---|---|---|
| A — Host compatibility | IEG is additive and the host prompt survives | met |
| B — Semantic non-conflict | no module contradicts an identified host semantic | met |
| C — Behavioural improvement | at least one target failure mode improves measurably against baseline | **unmet** |
| D — Information integrity | known-invalid information is no longer authoritative by default | **unmet** |
| E — Regression resilience | compaction, resume, and fork preserve governance state | met |
| F — Diagnosability | mount and gate decisions are observable without a logger exporter | met |
| G — Agent isolation | two live agents in one composition never share governance state | met |
| H — Compatibility baseline | the adapter reports a verdict and detects a simulated host change | met |
| I — Packaging | installable, licensed, changelogged, peer-range enforced | **partial** |
| J — Withdrawal integrity | the plugin ships three modules with no dangling reference to the removed one | met |

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
| R8-05 TS migration + decomposition | **in progress** | `536b8dd`, this commit | `scripts/verify.sh`, `src/host/tool-surface.ts`, `src/index.ts` | **done:** drift protection in the release gate (24 checks), falsified against committed drift; the tool surface (names, `renderJson`, the user-authority set) extracted into `src/host/`, establishing the layer boundary, with the public names re-exported so the API is unchanged. **Further:** the maintenance tool registration (115 lines) extracted into `src/host/maintenance-tool.ts` behind an explicit `MaintenanceToolSurface` — the dependency that was captured by the closure is now named and passed in, and a version pair travels through the surface so the host module never imports the entry point (no cycle). `src/index.ts` is 1162 lines from 1287. **Remaining:** orientation/status/information tool registrations, the guard, and the prompt/storage/compatibility sections are still one closure, so "index.ts is primarily composition/wiring" is not yet met |
| R8-06 reproducible builds | **done** | this commit | `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `test/integration/packaging.test.js` | toolchain pinned exactly (`typescript@6.0.3`, no range) and the package manager declared; lockfile committed; both workflows install with `npm ci --ignore-scripts` instead of a floating global; a test asserts zero runtime dependencies, an exact toolchain pin and a committed lockfile |
| R8-07 version source of truth | not started | — | — | — |
| R8-08 docs vs history | not started | — | — | — |
| R8-09 state schema evolution | not started | — | — | — |
| R8-10 multilingual overlap | not started | — | — | — |
| R8-11 credential workflow | not started | — | — | — |
| R8-12 Gate C/D closure | not started | — | — | blocked by U8-01 until the predecessors are done |
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

**One reporting defect found by the newly-required CI job** and not yet fixed:
`verify.sh` prints "0 tests passed" on a non-TTY runner, because it counts `^✔`
lines while `node --test` emits TAP (`ok n - …`) when stdout is not a terminal. The
suite still runs and still fails the step on a real failure, but the number it
reports is wrong there. Recorded rather than quietly left.

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

1. **Behavioural improvement (Gate C) has no valid measurement — open.** The only
   measurements ever taken were against superseded prompt revisions and were
   deleted. Gate C needs a fresh `eval/` run with a rubric frozen beforehand and
   a judge that does not see the arm.
2. **Information integrity (Gate D) has no valid measurement — open.** The same
   fresh-run requirement applies to whether known-invalid information stops being
   reused as authoritative.
3. **Not a publishable package (Gate I) — partial.** `LICENSE`, `CHANGELOG.md`
   the `files` allowlist, and the narrowed peer range have landed; `"private":
   true` and the publish target remain until Gates C and D pass.
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
4. **Packaging close-out (Gate I)** — remove `private` and choose the publish
   target once Gates C and D pass.
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
dsh plugin --profile web add file:/home/hero/Deepseek-harness-0928/DSH-plugins/agent-behavioral-governance-pugin
```

## 11. Resolved: `dsh-free-search` removal

**Confirmed by the user as their own action.** The live `web` profile no longer
references `dsh-free-search` — absent from `dsh.profile.bundles`, from
`dependencies`, and from `node_modules`; manifest modified `2026-10-01 10:55:55`.

No IEG install or evaluation touched the live profile: every invocation exported
an isolated `DSH_HOME`. Recorded here so a future maintainer does not
re-investigate it as a side effect of this work.

## 12. Workspace layout and regeneration

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
