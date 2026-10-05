---
doc_type: testing-guide
project: information-environment-governance
version: 0.3.0
plugin_version: 0.12.1
status: active
owner: maintainers
last_reviewed: 2026-10-03
revision: 0.12.1-batch-7
audience: volunteers
language: en
---

# Volunteer testing guide

IEG is a **prototype**: the model-backed behavioural gates (C and D) have no
valid measurement yet, the package is publishable but not published, and the publish target is
undecided. That is exactly why volunteer testing matters — the missing evidence is
behavioural, and it can only come from real sessions. Current status and numbers:
[`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3–§4.

This guide covers how to **install**, how to **run a useful trial**, and how to
**report a behavioural deviation**. Read [`SECURITY.md`](SECURITY.md) first: IEG
is a governance layer, not a sandbox, and it is not a security control.

## 1. What you need

| Requirement | Notes |
|---|---|
| Node.js **>= 20** | the host and the tests both need it |
| DeepSeek Harness (`dsh`) | the single supported baseline is `0.2.1-alpha.1`: declared peer range `>=0.2.1-alpha.1 <0.3.0`, `dsh.compatibility.dshReleases` records that release as `verified`, and the committed baseline was re-captured against it ([`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §3–§4). The retired `0.2.0-rc.2` baseline is **SUPERSEDED** |
| A **throwaway** DSH profile | never test in a profile you rely on |

## 2. Install

IEG is installed into a profile, not globally. **Install it with the host's own
plugin installer** — the `dsh-ieg` command comes from the package, so it cannot
install it and will not exist yet on a clean machine. The canonical command block
is in [`README.md`](README.md) §Install; it is not restated here.

```bash
# 1. install through DSH (registry name, absolute path, git address, or tarball)
dsh plugin --profile ieg-test add https://github.com/ccneedb/dsh-information-environment-governance
dsh --profile ieg-test --dump-config | grep -A3 'id: ieg'      # the row must compose

# 2. only now does the post-install management command exist — path-local, not on PATH
"$DSH_HOME/profiles/ieg-test/node_modules/.bin/dsh-ieg" status
```

The `dsh-ieg` lifecycle (`install | update | uninstall`) manages an
**already-installed** package — for example to install a specific tarball into a
profile or to roll one back. It is never the first step:

```bash
"$DSH_HOME/profiles/ieg-test/node_modules/.bin/dsh-ieg" install --profile ieg-test --from <tarball-or-dir>
"$DSH_HOME/profiles/ieg-test/node_modules/.bin/dsh-ieg" uninstall --profile ieg-test
```

`dsh-ieg prompt` prints the effective text with its version and byte count. If you
prefer a stable command name, install the package globally once it is published
(`npm install -g dsh-information-environment-governance`) or use `npx dsh-ieg …`.

> **Command syntax gotcha.** Everything after `dsh plugin --profile <name>` is
> forwarded **verbatim to pnpm**, so launcher flags such as
> `--from-default-profile`, `--dump-config`, or `--patch` must never appear there
> — you will get `Usage: pnpm [OPTIONS] <COMMAND>`. Launcher flags go with the
> launcher: `dsh --profile <name> --from-default-profile headless --dump-config`.

`dsh plugin --profile <name> add` initializes the profile if it does not exist
yet, so an explicit creation step is optional — it only lets you choose the
template. A profile **links the plugin at install time**, so **re-install after
any source change** or you will keep exercising the old code.

### Did it actually load?

Installing is not the same as running. Check the composed tree first, then the
package on disk, then ask the plugin about itself:

```bash
# 1. Is the row in THIS profile's composed tree? (the decisive check)
dsh --profile ieg-test --dump-config | grep -A4 'id: ieg'

# 2. Is the package on disk, and which version?
cat "$DSH_HOME/profiles/ieg-test/node_modules/dsh-information-environment-governance/package.json" 2>/dev/null | grep '"version"'

# 3. Boot that profile and ask IEG about itself (in-session)
dsh --profile ieg-test "<any task>"
#   then call the read-only `ieg_status` tool, or read the `ieg:status` line
```

Or let the checker do all of it — run it from a repository clone, since it does
not ship in the release tarball:

```bash
./scripts/check-install.sh ieg-test
```

**Why the plugin list can still look empty.** DSH shows the bundles of the
profile you are **running**, not the ones you installed elsewhere. If you
installed into `ieg-test` while your app runs the `web` profile, IEG will never
appear in that list — correctly. Either run the profile you installed into
(`dsh --profile ieg-test …`), or install into the profile you actually run:

```bash
dsh plugin --profile web add "<same package reference>"
```

**Inspect it from the terminal.** IEG has no Web panel. After installing, use the
read-only `ieg_status` tool (or the profile-local `dsh-ieg prompt`) to see the mount
state, and the row's `enabled: false` to compare against — that switch is how
governance is turned off for a profile without touching the installation.

Installing into the live `web` profile modifies it. The project does not
recommend it while the behavioural gates (C and D) are unmeasured — see
[`MAINTENANCE-HANDOFF.md`](MAINTENANCE-HANDOFF.md) §10.

## 3. Configure it for a first trial

IEG's defaults are deliberately non-intrusive, but two settings fail *closed*
where no approval channel exists (headless, CI). For a first trial, prefer:

```yaml
# overlay.yml — apply with: dsh --profile ieg-test --patch overlay.yml "<task>"
- id: ieg
  config:
    workspace:
      policy: allow            # do not ask for approval on every write
      overlapCheck: ask        # keep the duplicate-document check armed
      protectedPaths: []       # add paths you never want touched
    preStep:
      orientationGate: off     # observe only; use 'warn' to see the signal
      requireBeforeMutation: false
```

If you *want* to test the gates themselves, set `policy: ask` or `deny` and
`requireBeforeMutation: true`, and record what happened — that is the behaviour
the project most needs evidence about. `userAttention` is **not** a valid key in
0.7.0; the module it configured was removed, and the validator rejects the key.

### Seeing it from the terminal: `dsh-ieg`

The terminal interface is the fastest way to answer "is IEG even doing anything?",
which is otherwise indistinguishable from silence. It is a **prompt CLI** — Batch 5
removed its installation and lifecycle commands, because the host owns installation.

```bash
npm run build
export PATH="$PWD/bin:$PATH"

dsh-ieg prompt                 # the effective text, its version and byte count
dsh-ieg prompt edit            # $EDITOR round-trip; validated before it is stored
dsh-ieg --help                 # the whole surface: prompt, prompt edit, version
# to test without governance, set `enabled: false` in the profile row and restart
```

- **`dsh-ieg prompt`** prints the effective section, its version and its byte
  count; **`dsh-ieg prompt edit`** opens `$EDITOR` on a temp copy and stores the
  result only after the same validation the plugin applies (`{{ }}` and the byte
  ceiling are refused, with reasons). There is no `prompt reset`: to return to the
  compiled default, delete the file by hand.
- `prompt.md` lives at `$IEG_PROMPT_FILE`, else `<state-dir>/ieg/prompt.md` with
  `<state-dir>` = `$XDG_STATE_HOME` or `~/.local/state`. The plugin re-reads it on
  each assembly, so an edit applies without a restart.
- Use the agent-facing `ieg_status` tool (or the `ieg:status` runtime-context line)
  to capture machine-readable state for a report.

## 4. What a useful trial looks like

1. **Run one real task** with IEG enabled, in a copy of a workspace you can lose.
2. **Note the interaction**: did IEG ask, deny, or stay silent? Was the outcome
   right? Did the agent establish project orientation before making changes?
3. **Run the same task with IEG disabled.** Removing the `- id: ieg` row from the
   overlay is **not** enough: the profile still mounts the plugin with defaults.
   Use `enabled: false` in the overlay, uninstall IEG ([`README.md`](README.md)
   §Install), or use a second profile with no IEG row. This A/B is the single most
   valuable thing you can contribute: it separates an IEG defect from a host or
   model defect.
4. **Capture state** by asking the agent to call `ieg_status`, or by running
   the `ieg_status` tool, or by reading the diagnostics mirror if the profile
   sets `diagnosticsExport.file`.

The metrics the project is trying to establish — a newly created document
duplicating an existing one, whether an unmasked stale claim survives, and how
many persistent artifacts a task adds — are listed in
[`eval/README.md`](eval/README.md). The decisive information-integrity question
is not whether the agent *notices* invalidity, but whether invalidated
information stops being reused as authoritative.

## 5. Uninstall

Use the host's plugin removal (`dsh plugin --profile <name> remove
dsh-information-environment-governance`) — see [`README.md`](README.md) §Install.
There is no `dsh-ieg uninstall`, and nothing else removes the package.

**Turning governance off is not uninstalling.** `enabled: false` in the `ieg` row
stops the prompt section and passes every hook through, while the package stays
installed. Only the host's plugin commands touch the installation — a separation
Batch 5 made deliberate.

## 6. Report a behavioural deviation

A deviation report is an **ordinary GitHub issue**. Use the repository's issue
form:

- **Bug report** — [`.github/ISSUE_TEMPLATE/bug_report.yml`](.github/ISSUE_TEMPLATE/bug_report.yml)
- **Feature request** — [`.github/ISSUE_TEMPLATE/feature_request.yml`](.github/ISSUE_TEMPLATE/feature_request.yml)

Include, in the form's own fields:

1. the task you ran and the workspace shape (a copy you can share);
2. the A/B result from §4 — the same task with `enabled: false`;
3. the read-only `ieg_status` report, which carries the plugin version,
   `PROMPT_VERSION`, the prompt source and file, the mount record and the recent
   diagnostics;
4. what you expected and what happened, in project terms.

Read the `ieg_status` output (and any diagnostics you quote) before posting: it names
paths and versions, not file contents, but you are responsible for what you
paste. Do not include credentials, private file contents, or session logs; see
[`SECURITY.md`](SECURITY.md).

## 7. Before filing: things that are not bugs

The authoritative list of accepted limits — not vulnerabilities, and not bugs — is
maintained once in [`SECURITY.md`](SECURITY.md) §Known limitations. Read it before
filing: an accepted limit costs maintainer time. Gate C or D evidence is not a
"not a bug" report — it is exactly what this project is missing.

## 8. Privacy

Reports are public once you submit them. The free-text fields you write are
yours: do not paste credentials, private file contents, or session logs. See
[`SECURITY.md`](SECURITY.md).
