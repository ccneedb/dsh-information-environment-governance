/**
 * Structural regression: the repository must be installable as a DSH bundle.
 *
 * This is the test that the 0.7.0 install defect demanded. DSH refuses any
 * package whose manifest does not declare `dsh.bundle` (`not-a-bundle` →
 * "<name> declares no dsh.bundle"), and it installs whatever package the
 * repository root declares. A repository whose package lived in a
 * subdirectory therefore installed fine by hand and failed from the Web UI's
 * Git flow, because the root had no manifest at all.
 *
 * These assertions are deliberately structural. They establish that the
 * *mechanism* can install and mount; they say nothing about whether a governed
 * agent behaves better, which only `eval/` can establish.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** @param {string} rel @returns {string} */
const at = (rel) => join(REPO, rel)

const manifest = JSON.parse(readFileSync(at('package.json'), 'utf8'))

/** The single DSH baseline this package supports (§3 of the Batch 2 policy). */
const DECLARED_BASELINE = '0.2.1-alpha.1'

/** Every file a runtime source tree may contain, as repo-relative paths. */
function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(at(dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...sourceFiles(rel))
    else if (/\.(js|ts|mjs)$/.test(entry.name)) out.push(rel)
  }
  return out
}

test('the repository root is the installable DSH bundle', () => {
  assert.equal(manifest.name, 'dsh-information-environment-governance')

  // Publishable, not published: Batch 4 made the package npm-ready, while
  // publication itself stays a gated release action. `private: true` would make
  // `npm publish` impossible, so the two states must be checked together.
  assert.notEqual(manifest.private, true, 'a publishable package must not be private')
  assert.equal(manifest.publishConfig?.access, 'public')

  const patch = manifest.dsh?.bundle?.patch
  assert.equal(typeof patch, 'string', 'the manifest must declare dsh.bundle.patch')
  assert.ok(existsSync(at(patch)), `the declared bundle patch must exist: ${patch}`)

  assert.equal(typeof manifest.main, 'string')
  assert.ok(existsSync(at(manifest.main)), `the declared main entry must exist: ${manifest.main}`)

  const bin = manifest.bin?.['dsh-ieg']
  assert.equal(typeof bin, 'string', 'the package must install the dsh-ieg command')
  assert.ok(existsSync(at(bin)), `the declared bin must exist: ${bin}`)
})

test('the declared baseline is the only supported one', () => {
  const range = manifest.dsh?.engines?.dsh
  assert.equal(typeof range, 'string')
  assert.ok(range.includes(DECLARED_BASELINE), `the peer range must admit ${DECLARED_BASELINE}`)
  assert.ok(!range.includes('0.2.0-rc.2'), 'the retired baseline must be gone from the peer range')

  const releases = Object.keys(manifest.dsh?.compatibility?.dshReleases ?? {})
  assert.deepEqual(releases, [DECLARED_BASELINE])
})

test('the committed baseline file describes the declared baseline', () => {
  const baseline = JSON.parse(readFileSync(at('lib/compatibility-baseline.json'), 'utf8'))
  assert.equal(baseline.hostVersion, DECLARED_BASELINE)
  assert.ok(Array.isArray(baseline.sectionNames))
  assert.ok(baseline.sectionNames.includes('ieg:governance'), 'the IEG section must appear in the baseline')
  assert.deepEqual(baseline.capabilities, ['systemPrompt'])
})

test('the files allowlist ships every declared entry, and only what is needed', () => {
  const allowed = manifest.files
  assert.ok(Array.isArray(allowed) && allowed.length > 0)
  for (const entry of allowed) {
    assert.ok(existsSync(at(entry)), `the files allowlist names a missing path: ${entry}`)
  }
  for (const required of ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    assert.ok(allowed.includes(required), `the files allowlist must ship ${required}`)
  }
  // A git-installable bundle must ship the built runtime: pnpm does not run a
  // build step for a git dependency, so the compiled entry has to be committed.
  assert.ok(existsSync(at('lib/index.js')), 'the compiled entry must be committed for Git installs')
  // The published artifact is exactly the runtime: development trees must never
  // ship. A consumer that needs `src/` or the test suite means the package is
  // carrying files nobody installs.
  for (const forbidden of ['src', 'test', 'test-support', 'eval', 'docs', '.github', 'tsconfig.json']) {
    assert.ok(!allowed.includes(forbidden), `the files allowlist must not ship ${forbidden}`)
  }
})

test('no obsolete package layout or withdrawn capability remains', () => {
  assert.ok(!existsSync(at('plugin')), 'the nested plugin/ package must not exist')
  assert.ok(!existsSync(at('lib/kernel/questions.js')), 'the question ledger must be gone')
  assert.ok(!existsSync(at('lib/modules/user-attention.js')), 'the user-attention module must be gone')
  // Build output must live beside the sources it mirrors, not in a second
  // output directory. Spelled in two parts so a path sweep cannot silently
  // rewrite this assertion into a tautology.
  const nestedOutput = `lib/${'generated'}`
  assert.ok(!existsSync(at(nestedOutput)), `build output must not live in ${nestedOutput}`)
})

test('the runtime carries no retired baseline or withdrawn-capability reference', () => {
  // Identifiers, not prose: the sources deliberately record *why* the
  // capability was withdrawn, and that history is allowed to name it. What must
  // not survive is anything that could re-bind it — the config key, the module
  // id as a quoted string, the old file names, the tool names, the old host
  // baseline.
  const stale = ['0.2.0-rc.2', 'userAttention', "'user-attention'", 'user-attention.js', 'questions.js', 'ieg_questions', 'record_question']
  for (const file of [...sourceFiles('lib'), ...sourceFiles('src')]) {
    const text = readFileSync(at(file), 'utf8')
    for (const needle of stale) {
      assert.ok(!text.includes(needle), `${file} still references ${needle}`)
    }
  }
})

test('the runtime is fully migrated: every built module has a TypeScript source', () => {
  // The TypeScript policy: src/**/*.ts is the source of truth and lib/** is its
  // build output. A hand-written .js in lib/ with no src/ counterpart is exactly
  // the "second, hand-maintained source" the policy forbids.
  const built = sourceFiles('lib').filter((file) => file.endsWith('.js'))
  assert.ok(built.length > 0, 'the compiled runtime must be committed')
  for (const file of built) {
    const source = file.replace(/^lib\//, 'src/').replace(/\.js$/, '.ts')
    assert.ok(existsSync(at(source)), `${file} has no TypeScript source at ${source}`)
  }
  // lib/contract.d.ts is the one deliberate hand-authored declaration file.
  assert.ok(statSync(at('lib/contract.d.ts')).isFile())
})

/**
 * The source-language policy (Batch 5 §4).
 *
 * TypeScript is the only permitted hand-written runtime/application language. The
 * documented exceptions are the generated `lib/**`, the host-mandated
 * extensionless `bin/ieg` shim, and the tooling under `scripts/`, `eval/` and
 * `test/`. The rule is enforced here rather than left to convention, so a
 * hand-written runtime `.js` fails the suite instead of a review.
 */
test('the runtime is TypeScript-only, with exactly the documented exceptions', () => {
  const sources = sourceFiles('src')
  assert.ok(sources.length > 0, 'src/ must carry the runtime sources')
  for (const file of sources) {
    assert.ok(file.endsWith('.ts'), `${file} is not TypeScript`)
  }
  for (const file of readdirSync(at('lib'), { withFileTypes: true })) {
    assert.ok(!file.name.endsWith('.mjs'), `lib/${file.name} is hand-written tooling inside the build output`)
  }
  const strays = readdirSync(at('.'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name))
    .map((entry) => entry.name)
  assert.deepEqual(strays, [], `hand-written JavaScript at the repository root: ${strays.join(', ')}`)
  assert.match(readFileSync(at('bin/ieg'), 'utf8'), /^#!\/usr\/bin\/env node/, 'bin/ieg is the host-mandated shim')
})

/**
 * Release-metadata drift (Batch 5 §5).
 *
 * One version, stated once, must agree everywhere it is repeated: the manifest,
 * the runtime's `PLUGIN_VERSION`, the newest changelog heading, and every
 * document's `plugin_version` front matter. A drift check is cheaper than
 * noticing a stale figure in a document six months later.
 */
test('release metadata is internally consistent', async () => {
  const ieg = await import('../../lib/index.js')
  assert.equal(ieg.PLUGIN_VERSION, manifest.version, 'PLUGIN_VERSION disagrees with package.json')

  const changelog = readFileSync(at('CHANGELOG.md'), 'utf8')
  const newest = changelog.match(/^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/m)
  assert.ok(newest, 'the changelog must carry a released version heading')
  assert.equal(newest[1], manifest.version, 'the newest changelog entry disagrees with package.json')

  const documents = [
    ...readdirSync(at('.'), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name),
    ...readdirSync(at('docs'), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => `docs/${e.name}`),
  ]
  for (const doc of documents) {
    const front = readFileSync(at(doc), 'utf8').match(/^plugin_version:\s*(\S+)/m)
    if (front) {
      assert.equal(front[1], manifest.version, `${doc} front matter plugin_version disagrees with package.json`)
    }
  }

  // The declared peer range is a compatibility statement; exactly one host release
  // is verified, and the committed baseline file must name that same release.
  assert.equal(manifest.dsh.engines.dsh, `>=${DECLARED_BASELINE} <0.3.0`)
  assert.ok(
    readFileSync(at('lib/compatibility-baseline.json'), 'utf8').includes(DECLARED_BASELINE),
    'the committed baseline file must describe the declared baseline',
  )
})

/**
 * R8-06: reproducible builds and development dependencies.
 *
 * The package's zero-runtime-dependency property is a design commitment, not an
 * accident: it is what lets IEG mount in any composition without resolving a tree. The
 * build toolchain, by contrast, must be pinned exactly and resolved from a lockfile, so
 * that a verification result describes a known compiler rather than whatever the
 * registry served that morning.
 */
test('R8-06: zero runtime dependencies, and an exactly pinned build toolchain', () => {
  assert.deepEqual(manifest.dependencies ?? {}, {}, 'IEG ships with zero runtime dependencies')
  const dev = manifest.devDependencies ?? {}
  assert.ok(dev.typescript, 'the build toolchain is declared as a devDependency')
  assert.match(String(dev.typescript), /^\d+\.\d+\.\d+$/, `the toolchain must be pinned exactly, not a range: ${dev.typescript}`)
  assert.ok(existsSync(at('package-lock.json')), 'a committed lockfile is what makes the install reproducible')
  assert.notEqual(manifest.packageManager, undefined, 'the package manager itself is declared')
})

/**
 * B10-P0-02 / Gate I clause 4: the peer range must be *enforced*, not merely declared.
 *
 * The installed host enforces a plugin's `peerDependencies` (`evaluatePluginCompatibility`,
 * `dsh-app-boot`): with the field absent it returns immediately and nothing is checked, which
 * is why the gate's "peer-range enforced" clause was unmet while the range sat only under
 * `dsh.engines.dsh`. These assertions keep the declared range and the enforced range from
 * drifting apart, and keep the enforced one present.
 */
test('B10-P0-02: the peer range is declared where the host enforces it, matching dsh.engines.dsh', () => {
  const peers = manifest.peerDependencies ?? {}
  assert.ok(
    Object.hasOwn(peers, '@deepseek-ai/dsh'),
    'the host checks peerDependencies; a range declared anywhere else is not enforced',
  )
  assert.equal(
    peers['@deepseek-ai/dsh'],
    manifest.dsh?.engines?.dsh,
    'the enforced range and the documented dsh.engines.dsh range must be identical strings',
  )
  assert.match(String(peers['@deepseek-ai/dsh']), /^\s*>=\s*\d+\.\d+\.\d+/, 'the enforced range is a lower-bounded range')
})
