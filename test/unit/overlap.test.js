import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  detectOverlap,
  extractDocumentWrite,
  firstHeading,
  headingsOf,
  filenameStemTokens,
  subjectCoverage,
  jaccard,
  tokensOf,
  checkDocumentOverlap,
  DEFAULT_OVERLAP_THRESHOLD,
} from '../../lib/kernel/overlap.js'

const SPEC = `# Widget Service — Specification

Status: current and authoritative.

## API surface (v2)

Every request carries a bearer token in the Authorization header.
Widgets live in the widgets table, one row per widget.
`

const UNRELATED = `# Deployment runbook

Roll the canary forward in ten percent increments and watch the error budget.
`

/**
 * A filesystem stub keyed by absolute path.
 *
 * @param {Record<string, string>} files
 * @returns {IegFileSystemService}
 */
function stubFs(files) {
  return {
    resolve: async (/** @type {string} */ target) => ({ targetKey: target, displayPath: target }),
    stat: async (/** @type {any} */ target) => (target.targetKey in files ? { version: 1 } : undefined),
    readText: async (/** @type {any} */ target) => {
      const content = files[target.targetKey]
      if (content === undefined) throw new Error('ENOENT')
      return content
    },
    listDir: async (/** @type {any} */ target) =>
      Object.keys(files)
        .filter((candidate) => path.dirname(candidate) === target.targetKey)
        .map((candidate) => ({
          name: path.basename(candidate),
          type: /** @type {'file'} */ ('file'),
          target: { targetKey: candidate, displayPath: candidate },
          size: files[candidate].length,
        })),
  }
}

test('tokensOf ignores short words and case', () => {
  const tokens = tokensOf('The Widget and the widget')
  assert.ok(tokens.has('widget'))
  assert.equal(tokens.has('the'), false)
})

test('jaccard is symmetric and bounded', () => {
  const a = new Set(['a1', 'b2', 'c3'])
  const b = new Set(['b2', 'c3', 'd4'])
  assert.equal(jaccard(a, b), jaccard(b, a))
  assert.equal(jaccard(a, a), 1)
  assert.equal(jaccard(a, new Set()), 0)
})

test('firstHeading finds the H1 only', () => {
  assert.equal(firstHeading('# Widget Service\n\ntext'), 'widget service')
  assert.equal(firstHeading('## Not an H1'), null)
  assert.equal(firstHeading('no heading'), null)
})

test('detectOverlap flags a near-duplicate by content', () => {
  const result = detectOverlap({
    content: SPEC.replace('Status: current and authoritative.', 'Status: freshly written.'),
    existing: [{ path: 'SPEC.md', content: SPEC }],
  })
  assert.equal(result.overlapping, true)
  assert.equal(result.with, 'SPEC.md')
  assert.ok(result.similarity >= DEFAULT_OVERLAP_THRESHOLD)
})

test('detectOverlap flags a same-title document even when the wording diverges', () => {
  const result = detectOverlap({
    content: '# Widget Service — Specification\n\nTotally different prose about something else entirely.\n',
    existing: [{ path: 'SPEC.md', content: SPEC }],
  })
  assert.equal(result.overlapping, true)
  assert.equal(result.same_title, true)
  assert.equal(result.details[0].path, 'SPEC.md')
})

test('detectOverlap leaves genuinely unrelated documents alone', () => {
  const result = detectOverlap({ content: UNRELATED, existing: [{ path: 'SPEC.md', content: SPEC }] })
  assert.equal(result.overlapping, false)
  assert.deepEqual(result.details, [])
})

test('detectOverlap with nothing to compare against is not an overlap', () => {
  assert.equal(detectOverlap({ content: SPEC, existing: [] }).overlapping, false)
})

test('extractDocumentWrite only matches complete document writes', () => {
  assert.deepEqual(extractDocumentWrite({ name: 'write', arguments: { file_path: '/w/A.md', content: 'x' } }), {
    path: '/w/A.md',
    content: 'x',
  })
  // Not a document extension.
  assert.equal(extractDocumentWrite({ name: 'write', arguments: { file_path: '/w/a.ts', content: 'x' } }), null)
  // A partial edit has no body worth comparing.
  assert.equal(extractDocumentWrite({ name: 'edit', arguments: { file_path: '/w/A.md' } }), null)
  // Empty content is not a document.
  assert.equal(extractDocumentWrite({ name: 'write', arguments: { file_path: '/w/A.md', content: '  ' } }), null)
  assert.equal(extractDocumentWrite({ name: 'write', arguments: {} }), null)
})

test('checkDocumentOverlap is inert when disabled or when no filesystem is available', async () => {
  const fs = stubFs({ '/w/SPEC.md': SPEC })
  const execution = { name: 'write', arguments: { file_path: '/w/AUTH.md', content: SPEC } }

  assert.equal(await checkDocumentOverlap({ fs, execution, mode: 'off' }), null)
  assert.equal(await checkDocumentOverlap({ fs: undefined, execution, mode: 'ask' }), null)
})

test('checkDocumentOverlap refuses a duplicate new document and names the original', async () => {
  const fs = stubFs({ '/w/SPEC.md': SPEC, '/w/README.md': '# Index\n\nlinks\n' })
  const execution = { name: 'write', arguments: { file_path: '/w/AUTH.md', content: SPEC } }

  const decision = await checkDocumentOverlap({ fs, execution, mode: 'deny' })
  assert.equal(decision?.kind, 'deny')
  assert.match(decision.reason, /AUTH\.md/)
  assert.match(decision.reason, /SPEC\.md/)
  assert.match(decision.reason, /Extend the existing document/)
})

test('checkDocumentOverlap honours the ask mode', async () => {
  const fs = stubFs({ '/w/SPEC.md': SPEC })
  const execution = { name: 'write', arguments: { file_path: '/w/AUTH.md', content: SPEC } }
  assert.equal((await checkDocumentOverlap({ fs, execution, mode: 'ask' }))?.kind, 'ask')
})

test('checkDocumentOverlap permits a genuinely new document', async () => {
  const fs = stubFs({ '/w/SPEC.md': SPEC })
  const execution = { name: 'write', arguments: { file_path: '/w/DEPLOY.md', content: UNRELATED } }
  assert.equal(await checkDocumentOverlap({ fs, execution, mode: 'deny' }), null)
})

test('checkDocumentOverlap does not obstruct overwriting an existing file', async () => {
  // The file already exists, so this is an overwrite of something the agent
  // inspected — the normal path, which must never be gated.
  const fs = stubFs({ '/w/SPEC.md': SPEC })
  const execution = { name: 'write', arguments: { file_path: '/w/SPEC.md', content: SPEC } }
  assert.equal(await checkDocumentOverlap({ fs, execution, mode: 'deny' }), null)
})

test('checkDocumentOverlap fails open when the filesystem misbehaves', async () => {
  const broken = {
    resolve: async () => {
      throw new Error('SANDBOX_DENIED')
    },
    stat: async () => undefined,
    readText: async () => '',
    listDir: async () => [],
  }
  const execution = { name: 'write', arguments: { file_path: '/w/AUTH.md', content: SPEC } }
  assert.equal(await checkDocumentOverlap({ fs: broken, execution, mode: 'deny' }), null)
})

/* ─────────── regression: the failure the evaluation actually observed ────── */

/**
 * Taken verbatim from `eval/runs/auth-doc-request-control-r1`. A control agent
 * was asked to write up the authentication model and produced this document,
 * duplicating the `## Authentication` section `SPEC.md` already had.
 *
 * Body similarity against `SPEC.md` is only ~0.14 — the two documents share a
 * subject but almost no wording — so a Jaccard-only detector misses it. This is
 * why the subject signal exists.
 */
const OBSERVED_DUPLICATE = `# Widget Service Authentication

A guide for new engineers.

## How authentication works

Clients hold service credentials and exchange them at the accounts service for
a bearer token. The token is presented on every request in the Authorization
header.
`
const SPEC_WITH_AUTH_SECTION = `# Widget Service — Specification

## API surface (v2)

| Operation | Endpoint |
|---|---|
| list | GET /v2/widgets |

## Authentication

Every request carries a bearer token in the Authorization header.
Tokens are issued by the accounts service and expire after 24 hours.

## Storage

Widgets live in the widgets table.
`

test('regression: a low-similarity rewrite of a documented subject is still caught', () => {
  const verdict = detectOverlap({
    path: 'AUTHENTICATION.md',
    content: OBSERVED_DUPLICATE,
    existing: [{ path: 'SPEC.md', content: SPEC_WITH_AUTH_SECTION }],
  })

  // The old body-only rule would not have fired here.
  assert.ok(verdict.similarity < DEFAULT_OVERLAP_THRESHOLD, `body similarity was ${verdict.similarity}`)
  // The subject rule does.
  assert.equal(verdict.subject, true)
  assert.equal(verdict.overlapping, true)
  assert.equal(verdict.details[0].path, 'SPEC.md')
})

test('regression: the observable failure is refused through the gate', async () => {
  const fs = stubFs({ '/w/SPEC.md': SPEC_WITH_AUTH_SECTION })
  const execution = { name: 'write', arguments: { file_path: '/w/AUTHENTICATION.md', content: OBSERVED_DUPLICATE } }
  const decision = await checkDocumentOverlap({ fs, execution, mode: 'deny' })
  assert.equal(decision?.kind, 'deny')
  assert.match(decision.reason, /same subject/)
  assert.match(decision.reason, /SPEC\.md/)
})

test('the subject signal does not fire on an unrelated subject', () => {
  const verdict = detectOverlap({
    path: 'DEPLOYMENT.md',
    content: UNRELATED,
    existing: [{ path: 'SPEC.md', content: SPEC_WITH_AUTH_SECTION }],
  })
  assert.equal(verdict.subject, false)
  assert.equal(verdict.overlapping, false)
})

test('the subject signal does not fire when the new file is the original', () => {
  // Editing `SPEC.md` must never be gated as a duplicate of `SPEC.md`.
  const verdict = detectOverlap({
    path: 'SPEC.md',
    content: SPEC_WITH_AUTH_SECTION,
    existing: [{ path: 'SPEC.md', content: SPEC_WITH_AUTH_SECTION }],
  })
  assert.equal(verdict.subject, false)
})

test('heading, stem, and coverage helpers behave', () => {
  assert.deepEqual(headingsOf('# A\n\ntext\n\n## Authentication Model\n### More'), ['a', 'authentication model', 'more'])
  // Tokens shorter than four characters are ignored, so "API" does not count.
  assert.deepEqual([...filenameStemTokens('/docs/API-REFERENCE.md')], ['reference'])
  assert.deepEqual([...filenameStemTokens('/docs/AUTHENTICATION.md')], ['authentication'])
  assert.equal(subjectCoverage(new Set(['authentication']), { path: 'SPEC.md', content: SPEC_WITH_AUTH_SECTION }), 1)
  assert.equal(subjectCoverage(new Set(['deployment']), { path: 'SPEC.md', content: SPEC_WITH_AUTH_SECTION }), 0)
  assert.equal(subjectCoverage(new Set(), { path: 'SPEC.md', content: SPEC }), 0)
})

test('regression: a short-form filename still matches its long-form heading', () => {
  // The end-to-end evaluation produced `AUTH.md` duplicating a
  // `## Authentication` section. Exact token matching scored that as no overlap.
  const spec = '# Widget Service — Specification\n\n## Authentication\n\nBearer tokens.\n'
  assert.equal(subjectCoverage(new Set(['auth']), { path: 'SPEC.md', content: spec }), 1)

  const verdict = detectOverlap({
    path: 'AUTH.md',
    content: '# Auth\n\nHow requests are authenticated.\n',
    existing: [{ path: 'SPEC.md', content: spec }],
  })
  assert.equal(verdict.subject, true)
  assert.equal(verdict.overlapping, true)

  // A file whose subject does not appear anywhere is still left alone.
  assert.equal(
    detectOverlap({
      path: 'CHANGELOG.md',
      content: '# Changelog\n\nEntries.\n',
      existing: [{ path: 'SPEC.md', content: spec }],
    }).overlapping,
    false,
  )
})

/* ── R8-10: multilingual, Unicode-aware tokenisation ────────────────────────── */

test('R8-10: a Chinese document now yields tokens at all', () => {
  // The regression this guards: the previous tokenizer split on `[^a-z0-9/_.-]+`, so a
  // document written entirely in Chinese produced an **empty** token set. Every Chinese
  // pair then scored a Jaccard of 0 — duplicates and unrelated files alike.
  const tokens = tokensOf('# 信息环境治理\n\n治理代理在项目中持续接触的持久信息与项目约束。')
  assert.ok(tokens.size > 0, 'a Chinese document must produce comparable tokens')
  assert.ok([...tokens].some((token) => token.includes('信息')), 'character bigrams are emitted')
})

test('R8-10: simplified Chinese duplicates are detectable and unrelated files are not', () => {
  const original = '# 信息环境治理\n\n治理代理在项目中持续接触的持久信息与项目约束。'
  const nearDuplicate = '# 信息环境治理\n\n治理代理在项目中持续接触的持久信息与项目约束，保持一致性。'
  const unrelated = '# 烘焙食谱\n\n如何用慢发酵做出好吃的面包。'
  const a = tokensOf(original)
  const b = tokensOf(nearDuplicate)
  const c = tokensOf(unrelated)
  assert.ok(jaccard(a, b) >= DEFAULT_OVERLAP_THRESHOLD, 'a near-duplicate must clear the threshold')
  assert.ok(jaccard(a, c) < DEFAULT_OVERLAP_THRESHOLD, 'an unrelated document must not')
})

test('R8-10: traditional Chinese and mixed-language text behave the same way', () => {
  const traditional = '# 資訊環境治理\n\n治理代理在專案中持續接觸的持久資訊與專案約束。'
  const traditionalNear = '# 資訊環境治理\n\n治理代理在專案中持續接觸的持久資訊與專案約束，保持一致。'
  assert.ok(jaccard(tokensOf(traditional), tokensOf(traditionalNear)) >= DEFAULT_OVERLAP_THRESHOLD)

  const mixed = '# Information Environment 信息环境\n\nThe agent 治理 the persistent information 持久信息 it inherits.'
  const mixedNear = '# Information Environment 信息环境\n\nThe agent 治理 the persistent information 持久信息 it inherits, over time.'
  const tokens = tokensOf(mixed)
  assert.ok([...tokens].some((token) => /^[a-z]{4,}$/.test(token)), 'Latin words are tokenised')
  assert.ok([...tokens].some((token) => token.includes('信息')), 'CJK bigrams are tokenised too')
  assert.ok(jaccard(tokens, tokensOf(mixedNear)) >= DEFAULT_OVERLAP_THRESHOLD)
})

test('R8-10: Markdown and code boundaries do not swallow either script', () => {
  const prose = '# 治理说明\n\n正文解释信息环境。\n'
  const withCode = '# 治理说明\n\n正文解释信息环境。\n\n```js\nconst 变量 = "持久信息"\n```\n\n`inline 代码`\n'
  // Code content is tokenised as text — no stripping — which is the conservative choice:
  // a document that copies another document's code is a duplicate for governance purposes.
  assert.ok(tokensOf(withCode).size > tokensOf(prose).size)
  const latinOnly = 'The quick brown fox jumps over the lazy dog'
  assert.ok(tokensOf(latinOnly).size >= 5, 'space-delimited scripts keep the previous behaviour')
  // ASCII behaviour is unchanged: the same four-character floor applies to Latin words.
  assert.ok(![...tokensOf('a bb ccc')].some((token) => token.length < 4))
})

test('R8-10: the scan reports how much it actually covered', async () => {
  const { scanDocumentTree } = await import('../../lib/kernel/overlap.js')
  const files = { 'README.md': '# one\n', 'docs/a.md': '# two\n', 'docs/b.md': '# three\n' }
  const makeFs = (failOn) => ({
    resolve: async (path) => ({ targetKey: { path: path.replace(/^\.\/?/, '') } }),
    listDir: async (target) => {
      const base = target.targetKey.path === '' ? '' : `${target.targetKey.path}/`
      const names = new Set()
      for (const path of Object.keys(files)) {
        if (!path.startsWith(base)) continue
        names.add(path.slice(base.length).split('/')[0])
      }
      return [...names].map((name) => {
        const full = `${base}${name}`
        const isFile = Object.prototype.hasOwnProperty.call(files, full)
        return isFile
          ? { name, type: 'file', target: { targetKey: { path: full } }, size: files[full].length }
          : { name, type: 'directory', target: { targetKey: { path: full } } }
      })
    },
    readText: async (target) => {
      if (target.targetKey.path === failOn) throw new Error('unreadable')
      return files[target.targetKey.path]
    },
  })

  const complete = await scanDocumentTree(makeFs(null), '.', {})
  assert.equal(complete.coverage, 'complete')
  assert.equal(complete.truncated, false)

  const bounded = await scanDocumentTree(makeFs(null), '.', { maxDocuments: 1 })
  assert.equal(bounded.coverage, 'bounded', 'hitting the document bound is reported, not hidden')
  assert.equal(bounded.truncated, true)

  const partial = await scanDocumentTree(makeFs('docs/a.md'), '.', {})
  assert.equal(partial.coverage, 'partial', 'an unreadable entry degrades the coverage claim')
  assert.deepEqual(partial.skipped, ['docs/a.md'])
})
