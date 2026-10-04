/**
 * Batch 6 — the maintenance round, the batch counter and role-aware placement.
 *
 * These are the tests the 0.10.0 capability arrived without. They pin the
 * properties that make the capability honest rather than merely present:
 *
 * - the round **proposes** and cannot apply, so no destructive action can happen
 *   as a side effect of asking for a report;
 * - an uncertain finding becomes `REQUIRES_REVIEW` instead of a confident action;
 * - the counter counts direct user instruction batches and nothing else —
 *   internal steps, tool calls and generated context must not inflate it;
 * - placement duplication needs the same functional role and materially distinct
 *   content to be *ruled out*, not lexical overlap to be ruled in.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DESTRUCTIVE_ACTIONS,
  DIAGNOSIS_DIMENSIONS,
  INVENTORY_CLASSES,
  MAINTENANCE_ACTIONS,
  MAINTENANCE_BATCH_THRESHOLD,
  authorityOf,
  classifyArtifact,
  classifyInventory,
  formatMaintenanceReport,
  formatReconciliation,
  parseFrontMatter,
  planMaintenance,
  reconcileChange,
  runMaintenanceRound,
} from '../../lib/kernel/maintenance.js'
import { completeMaintenanceRound, countInstructionBatch, createBatchCounter } from '../../lib/kernel/state.js'
import { detectOverlap, headingsMateriallyDistinct, jaccard, tokensOf } from '../../lib/kernel/overlap.js'

const tokens = (text) => [...tokensOf(text)]
const coverage = (a, b) => jaccard(new Set(a), new Set(b))

/** Classify a synthetic artifact the way the maintenance tool does. */
function artifact(path, content) {
  return classifyArtifact({ path, content, headings: [...content.matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => m[1]), tokens: tokens(content) })
}

/* ── inventory ──────────────────────────────────────────────────────────────── */

test('maintenance: the inventory and action vocabularies are the batches own', () => {
  assert.deepEqual(
    [...INVENTORY_CLASSES],
    [
      'authoritative-specification',
      'implementation-documentation',
      'configuration',
      'working-note',
      'generated-artifact',
      'historical-artifact',
      'temporary-artifact',
      'unknown-artifact',
    ],
  )
  assert.equal(MAINTENANCE_ACTIONS.length, 8)
  assert.deepEqual([...DESTRUCTIVE_ACTIONS], ['MERGE', 'REPLACE', 'DEPRECATE', 'REMOVE'])
  assert.equal(DIAGNOSIS_DIMENSIONS.length, 7)
  assert.equal(MAINTENANCE_BATCH_THRESHOLD, 7)
  // Every action a round may report is in the vocabulary; nothing is invented.
  for (const action of DESTRUCTIVE_ACTIONS) assert.ok(MAINTENANCE_ACTIONS.includes(action))
})

test('maintenance: the eight inventory classes are reachable from path and front matter', () => {
  const cases = [
    ['PRODUCT-SPEC.md', 'authoritative-specification'],
    ['README.md', 'implementation-documentation'],
    ['package.json', 'configuration'],
    ['notes/draft-idea.md', 'working-note'],
    ['lib/kernel/state.js', 'generated-artifact'],
    ['CHANGELOG.md', 'historical-artifact'],
    ['tmp/scratch.md', 'temporary-artifact'],
    ['whatever.md', 'unknown-artifact'],
  ]
  for (const [path, expected] of cases) {
    const front = expected === 'working-note' ? { doc_type: 'notes' } : {}
    assert.equal(classifyInventory(path, front).inventory, expected, `${path} should be ${expected}`)
  }
})

test('maintenance: front matter is parsed, and declared status drives authority', () => {
  const front = parseFrontMatter('---\ndoc_type: readme\nstatus: active\nowner: maintainers\n---\n\n# Title\n')
  assert.equal(front.doc_type, 'readme')
  assert.equal(front.status, 'active')
  assert.equal(authorityOf('implementation-documentation', front), 'authoritative')
  assert.equal(authorityOf('implementation-documentation', { status: 'superseded' }), 'historical')
  assert.equal(authorityOf('generated-artifact', {}), 'unknown')
  assert.deepEqual(parseFrontMatter('# no front matter'), {})
})

/* ── diagnosis and planning ─────────────────────────────────────────────────── */

test('maintenance: obsolescence and declared drift are found, and reported as proposals', () => {
  const retired = artifact('history/OLD-SPEC.md', '---\nstatus: retired\n---\n\n# Old spec\n')
  const drifted = artifact('README.md', '---\nplugin_version: 0.1.0\n---\n\n# Readme\n')
  const items = planMaintenance({
    artifacts: [retired, drifted],
    truth: { packageVersion: '0.10.0' },
    coverage,
  })
  const byPath = Object.fromEntries(items.map((item) => [item.path, item]))
  assert.equal(byPath['history/OLD-SPEC.md'].action, 'DEPRECATE')
  assert.equal(byPath['history/OLD-SPEC.md'].dimension, 'obsolescence')
  assert.equal(byPath['README.md'].action, 'UPDATE')
  assert.equal(byPath['README.md'].dimension, 'relevance')
  assert.match(byPath['README.md'].reason, /plugin_version 0\.1\.0/)
  // A confidently justified destructive action is still only a proposal.
  assert.equal(byPath['history/OLD-SPEC.md'].destructive, true)
})

test('maintenance: duplication needs the same functional role, not just similar wording', () => {
  const body = '# Release checklist\n\nSteps for releasing a version of the project.\n'
  const first = artifact('docs/release-a.md', body)
  const sameRole = artifact('docs/release-b.md', body)
  const differentRole = artifact('docs/release-c.md', `---\ndoc_type: notes\n---\n\n${body}`)

  const items = planMaintenance({ artifacts: [first, sameRole], truth: {}, coverage: () => 1 })
  const merged = items.filter((item) => item.action === 'MERGE')
  assert.equal(merged.length, 1)
  assert.equal(merged[0].path, 'docs/release-b.md')
  assert.equal(merged[0].destructive, true)

  // Same words, different declared role: not a merge candidate.
  const noMerge = planMaintenance({ artifacts: [first, differentRole], truth: {}, coverage: () => 1 })
  assert.equal(noMerge.filter((item) => item.action === 'MERGE').length, 0)
})

test('maintenance: below the confidence floor an action becomes REQUIRES_REVIEW', () => {
  const a = artifact('docs/a.md', '# Alpha\n\nalpha content here\n')
  const b = artifact('docs/b.md', '# Beta\n\nbeta content here\n')
  const items = planMaintenance({ artifacts: [a, b], truth: {}, coverage: () => 0.7, reviewFloor: 0.8 })
  const merged = items.find((item) => item.path === 'docs/b.md')
  assert.equal(merged.action, 'REQUIRES_REVIEW')
  // The review verdict is not itself destructive: nothing is proposed for deletion.
  assert.equal(merged.destructive, false)
})

test('maintenance: every scanned artifact receives exactly one verdict', () => {
  const artifacts = [
    artifact('PRODUCT-SPEC.md', '---\nstatus: active\nowner: maintainers\n---\n\n# Spec\n'),
    artifact('CHANGELOG.md', '---\ndoc_type: changelog\n---\n\n# Changelog\n'),
    artifact('package.json', '{}\n'),
  ]
  const report = runMaintenanceRound({ artifacts, truth: { packageVersion: '0.10.0' }, coverage })
  assert.equal(report.scanned, 3)
  assert.equal(report.items.length, 3)
  assert.deepEqual([...new Set(report.items.map((item) => item.path))].length, 3)
  assert.equal(report.counts.KEEP, 1)
  assert.equal(report.unresolved.length, 0)
  const text = formatMaintenanceReport(report)
  assert.match(text, /maintenance round: scanned 3 artifact/)
  assert.match(text, /proposals only/)
  assert.match(text, /inventory: /)
})

test('maintenance: a truncated scan and an unreadable path are reported as unresolved', () => {
  const report = runMaintenanceRound({
    artifacts: [artifact('README.md', '# Readme\n')],
    truth: {},
    coverage,
    truncated: true,
    skipped: ['docs/locked.md'],
  })
  assert.equal(report.truncated, true)
  assert.match(report.unresolved.join('\n'), /document bound/)
  assert.match(report.unresolved.join('\n'), /docs\/locked\.md/)
})

/* ── reconciliation ─────────────────────────────────────────────────────────── */

test('reconciliation: names affected artifacts and never claims full synchronization', () => {
  const changed = artifact('PRODUCT-SPEC.md', '# Product spec\n\ninformation environment governance scope\n')
  const mentions = artifact('docs/guide.md', '# Guide\n\ninformation environment governance scope explained\n')
  const unrelated = artifact('docs/other.md', '# Other\n\nunrelated cookbook notes about baking bread\n')
  const result = reconcileChange({
    change: { path: 'PRODUCT-SPEC.md', summary: 'Product spec', tokens: changed.tokens },
    artifacts: [changed, mentions, unrelated],
    truth: { packageVersion: '0.10.0' },
    coverage,
  })
  assert.equal(result.changed, 'PRODUCT-SPEC.md')
  assert.deepEqual(result.affected, ['docs/guide.md'])

  const alone = reconcileChange({
    change: { path: 'PRODUCT-SPEC.md', summary: 'Product spec', tokens: ['zzz', 'qqq'] },
    artifacts: [changed, unrelated],
    truth: {},
    coverage,
  })
  assert.equal(alone.affected.length, 0)
  assert.match(alone.unresolved.join(' '), /no other artifact mentions/)
  assert.match(formatReconciliation(alone), /reconciliation for PRODUCT-SPEC\.md/)
})

/* ── the seven-instruction-batch counter ────────────────────────────────────── */

test('counter: a direct user instruction batch counts once, and internal steps do not', () => {
  const counter = createBatchCounter()
  // Turn 0: the user's first batch.
  assert.deepEqual(countInstructionBatch(counter, { turn: 0, messages: [{ role: 'user' }] }).counted, true)
  // The same turn repeats for every internal step, with an empty inbox.
  assert.equal(countInstructionBatch(counter, { turn: 0, messages: [] }).counted, false)
  assert.equal(countInstructionBatch(counter, { turn: 0, messages: [{ role: 'user' }] }).counted, false)
  assert.equal(counter.count, 1)
  // A new turn with a message is a new instruction batch.
  assert.equal(countInstructionBatch(counter, { turn: 1, messages: [{ role: 'user' }, { role: 'user' }] }).counted, true)
  assert.equal(counter.count, 2)
  // Generated context and malformed payloads cannot inflate it.
  assert.equal(countInstructionBatch(counter, { turn: undefined, messages: [{ role: 'user' }] }).counted, false)
  assert.equal(countInstructionBatch(counter, { turn: 2, messages: undefined }).counted, false)
  assert.equal(counter.count, 2)
})

test('counter: maintenance becomes due exactly at seven and resets on a completed round', () => {
  const counter = createBatchCounter()
  const dues = []
  for (let turn = 0; turn < MAINTENANCE_BATCH_THRESHOLD; turn += 1) {
    dues.push(countInstructionBatch(counter, { turn, messages: [{ role: 'user' }] }).due)
  }
  // Six silent batches, then one that crosses the threshold — announced once.
  assert.deepEqual(dues, [false, false, false, false, false, false, true])
  assert.equal(counter.required, true)
  assert.equal(counter.count, MAINTENANCE_BATCH_THRESHOLD)
  // A further batch does not re-announce an already-required round.
  assert.equal(countInstructionBatch(counter, { turn: 99, messages: [{ role: 'user' }] }).due, false)

  completeMaintenanceRound(counter)
  assert.equal(counter.count, 0)
  assert.equal(counter.required, false)
  assert.equal(counter.roundsCompleted, 1)
})

/* ── placement: functional role and material distinctness ───────────────────── */

test('placement: without a role classifier the lexical behaviour is unchanged', () => {
  const content = '# House rules\n\nnever write outside the workspace\n'
  const existing = [{ path: 'notes/house-rules.md', content }]
  const overlap = detectOverlap({ path: 'notes/house-rules.md', content, existing })
  assert.equal(overlap.overlapping, true)
  assert.equal(overlap.with, 'notes/house-rules.md')
})

test('placement: the role classifier decides, and lexical evidence alone does not', () => {
  const content = '# Release checklist\n\nsteps for releasing a version\n'
  const body = '# Release checklist\n\nhow this project releases\n'
  const sameRole = [{ path: 'docs/checklist-release-steps.md', content: body }]
  const otherRole = [{ path: 'notes/checklist-release-steps.md', content: `---\ndoc_type: notes\n---\n\n${body}` }]
  const roleOf = (path, text) => classifyInventory(path, parseFrontMatter(text)).inventory
  const distinct = headingsMateriallyDistinct

  // Same role: the duplicate verdict stands, with the role evidence attached.
  const dup = detectOverlap({ path: 'docs/release-checklist.md', content, existing: sameRole, roleOf, distinct })
  assert.equal(dup.overlapping, true)
  assert.equal(dup.details[0].same_role, true)
  assert.equal(dup.details[0].materially_distinct, false)

  // Lexically the identical title is enough — this is the signal Batch 6 §4 says
  // must not be the *only* one.
  const lexical = detectOverlap({ path: 'docs/release-checklist.md', content, existing: otherRole })
  assert.equal(lexical.overlapping, true, 'lexical evidence alone does fire')

  // With the role classifier injected, a different functional role is not a
  // duplicate: the document would serve a different purpose.
  const gated = detectOverlap({ path: 'docs/release-checklist.md', content, existing: otherRole, roleOf, distinct })
  assert.equal(gated.overlapping, false, 'a document in a different functional role is not a duplicate')
  assert.deepEqual(gated.details, [])
})

test('placement: materially distinct content is not a duplicate even in the same role', () => {
  // Same role, related file names, but disjoint heading structure: the two cover
  // different ground, so the lexical subject signal must not decide it.
  const proposal = '# Release checklist\n\nsteps for releasing a version\n'
  const existing = [{ path: 'docs/checklist-release-steps.md', content: '# Deployment pipeline\n\nhow a release is deployed\n' }]
  const roleOf = (path, text) => classifyInventory(path, parseFrontMatter(text)).inventory

  const lexical = detectOverlap({ path: 'docs/release-checklist.md', content: proposal, existing })
  assert.equal(lexical.details[0].subject, true, 'the lexical subject signal fires on its own')

  const gated = detectOverlap({
    path: 'docs/release-checklist.md',
    content: proposal,
    existing,
    roleOf,
    distinct: headingsMateriallyDistinct,
  })
  assert.equal(gated.overlapping, false, 'disjoint heading structure means the information is materially distinct')
  assert.deepEqual(gated.details, [])
})

test('placement: heading distinctness is conservative without evidence', () => {
  assert.equal(headingsMateriallyDistinct('# Alpha\n\nalpha one two\n', '# Bravo\n\nbravo three four\n'), true)
  assert.equal(headingsMateriallyDistinct('# Alpha\n\nalpha one two\n', '# Alpha\n\nalpha one three\n'), false)
  // No headings on either side is no evidence, so it must not claim distinctness.
  assert.equal(headingsMateriallyDistinct('plain text alpha\n', 'plain text bravo\n'), false)
})
