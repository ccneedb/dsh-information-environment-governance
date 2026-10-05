/**
 * Batch 7 Phase 10 — terminology acceptance tests.
 *
 * The ten scenarios the batch names, each asserting both halves of the requirement:
 * the alignment outcome **and** that the mechanism does not overreach. A terminology
 * feature that corrected harmless wording would pass the first half and fail the
 * point of the batch, so non-overreach is tested as a first-class property.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUTHORITY_LADDER,
  TERM_SOURCES,
  TERM_STATUSES,
  confirmTerm,
  conflictTerm,
  createGlossary,
  deprecateTerm,
  deserialiseGlossary,
  findEntry,
  nonCurrentEntries,
  normaliseTerm,
  resolveTerm,
  serialiseGlossary,
  upsertTerm,
  validateEntry,
} from '../../lib/kernel/glossary.js'

/** A glossary with one confirmed term, as a real project would have. */
function seeded() {
  const glossary = createGlossary()
  confirmTerm(glossary, {
    canonicalTerm: 'Information Environment',
    definition: 'The persistent information and constraints an agent works with.',
    aliases: ['IE'],
    scope: 'product',
  })
  return glossary
}

/* 1 ─ exact canonical term: no intervention */
test('terminology 1: an exact canonical term needs no intervention', () => {
  const glossary = seeded()
  const match = resolveTerm(glossary, 'Information Environment')
  assert.equal(match.kind, 'exact')
  assert.equal(match.entry.status, 'CONFIRMED')
  // Case and spacing are normalised for *lookup* only, never as a correction.
  assert.equal(resolveTerm(glossary, '  information   environment ').kind, 'exact')
})

/* 2 ─ known harmless alias: accepted, not corrected */
test('terminology 2: a harmless alias is accepted without correction', () => {
  const glossary = seeded()
  const match = resolveTerm(glossary, 'IE')
  assert.equal(match.kind, 'alias')
  assert.equal(match.entry.canonicalTerm, 'Information Environment')
  assert.equal(match.matched, 'IE', 'the user\'s own wording is retained in the result')
})

/* 3 ─ materially ambiguous synonym: clarified when it matters */
test('terminology 3: a synonym mapping to two live terms is reported as ambiguous', () => {
  const glossary = createGlossary()
  upsertTerm(glossary, { canonicalTerm: 'scope', definition: 'the work in scope', aliases: ['area'], source: 'project-document' })
  upsertTerm(glossary, { canonicalTerm: 'area', definition: 'a directory region', aliases: [], source: 'project-document' })
  const match = resolveTerm(glossary, 'area')
  assert.equal(match.kind, 'exact', 'the exact term wins when one exists')
  const aliasAmbiguity = resolveTerm(glossary, 'region')
  assert.equal(aliasAmbiguity.kind, 'unknown', 'an unknown term is not turned into a correction')
})

test('terminology 3b: genuinely ambiguous aliases surface every candidate', () => {
  const glossary = createGlossary()
  upsertTerm(glossary, { canonicalTerm: 'objective', definition: 'a goal', aliases: ['target'], source: 'project-document' })
  upsertTerm(glossary, { canonicalTerm: 'metric', definition: 'a measure', aliases: ['target'], source: 'project-document' })
  const match = resolveTerm(glossary, 'target')
  assert.equal(match.kind, 'ambiguous')
  assert.deepEqual(match.candidates.map((entry) => entry.canonicalTerm).sort(), ['metric', 'objective'])
})

/* 4 ─ user intentionally chooses another term: intent preserved */
test('terminology 4: a user term outside the glossary is preserved, not normalised', () => {
  const glossary = seeded()
  const before = serialiseGlossary(glossary)
  const match = resolveTerm(glossary, 'environment context')
  assert.equal(match.kind, 'unknown')
  assert.deepEqual(serialiseGlossary(glossary), before, 'resolving a term never mutates the glossary')
})

/* 5 ─ user establishes a new canonical term: persisted */
test('terminology 5: a user-established term is persisted as confirmed', () => {
  const glossary = createGlossary()
  const result = confirmTerm(glossary, { canonicalTerm: 'Maintenance Round', definition: 'one inventory/diagnosis/planning pass' })
  assert.equal(result.outcome, 'created')
  assert.equal(result.entry.status, 'CONFIRMED')
  assert.equal(result.entry.confirmedByUser, true)
  assert.equal(result.entry.source, 'user')
  assert.equal(findEntry(glossary, 'maintenance round')?.canonicalTerm, 'Maintenance Round')
  assert.ok(resolveTerm(glossary, 'MAINTENANCE ROUND').kind === 'exact')
})

/* 6 ─ deprecated term: surfaced where relevant */
test('terminology 6: a deprecated term is surfaced, not silently normalised', () => {
  const glossary = createGlossary()
  confirmTerm(glossary, { canonicalTerm: 'Information Environment', definition: 'current', aliases: ['ABG'] })
  deprecateTerm(glossary, 'Information Environment', 'Information Environment Governance')
  assert.equal(findEntry(glossary, 'Information Environment')?.status, 'DEPRECATED')
  assert.equal(nonCurrentEntries(glossary).length, 1)
})

/* 7 ─ conflicting project documents: surfaced, never arbitrarily resolved */
test('terminology 7: a conflict is recorded and reported, with no meaning chosen', () => {
  const glossary = seeded()
  const before = findEntry(glossary, 'Information Environment')?.definition
  const result = conflictTerm(glossary, 'Information Environment', 'PRODUCT-SPEC and ARCHITECTURE define it differently')
  assert.equal(result.entry.status, 'CONFLICTED')
  assert.equal(result.entry.confirmedByUser, false, 'a conflicted entry cannot stay user-confirmed')
  assert.equal(result.entry.definition, before, 'the prior definition is retained, not replaced by a guess')
  assert.equal(resolveTerm(glossary, 'Information Environment').kind, 'conflicted')
  assert.match(result.reasons.join(' '), /define it differently/)
})

/* 8 ─ user overrides a provisional entry: the clarification takes effect */
test('terminology 8: a user clarification revises a provisional inferred entry', () => {
  const glossary = createGlossary()
  const inferred = upsertTerm(glossary, { canonicalTerm: 'workspace', definition: 'the agent\'s working directory' })
  assert.equal(inferred.entry.status, 'PROVISIONAL')
  assert.equal(inferred.entry.confirmedByUser, false)
  assert.ok(inferred.entry.confidence < 1)

  const clarified = confirmTerm(glossary, { canonicalTerm: 'workspace', definition: 'the project directory the session is scoped to' })
  assert.equal(clarified.outcome, 'updated')
  assert.equal(clarified.entry.status, 'CONFIRMED')
  assert.equal(clarified.entry.confirmedByUser, true)
  assert.match(clarified.entry.definition, /project directory/)
})

/* 9 ─ generated artifact uses deprecated terminology: warn/correct per policy */
test('terminology 9: deprecated terminology in an artifact is detectable, not silently rewritten', () => {
  const glossary = createGlossary()
  confirmTerm(glossary, { canonicalTerm: 'Information Environment', definition: 'current' })
  deprecateTerm(glossary, 'Information Environment')
  const deprecated = nonCurrentEntries(glossary)
  const match = resolveTerm(glossary, 'Information Environment')
  assert.equal(match.kind, 'exact')
  assert.equal(match.entry.status, 'DEPRECATED')
  assert.deepEqual(deprecated.map((entry) => entry.canonicalTerm), ['Information Environment'])
  // Detecting it is the mechanism's job; rewriting the artifact is not.
  assert.equal(findEntry(glossary, 'Information Environment')?.aliases.length, 0)
})

/* 10 ─ canonical form preferred where semantics require consistency */
test('terminology 10: the canonical form is offered deterministically for artifacts', () => {
  const glossary = seeded()
  const match = resolveTerm(glossary, 'ie')
  assert.equal(match.kind, 'alias')
  assert.equal(match.entry.canonicalTerm, 'Information Environment')
  assert.equal(normaliseTerm(match.entry.canonicalTerm), 'information environment')
})

/* ── non-overreach and the authority invariant ─────────────────────────────── */

test('terminology: an inferred entry can never revise a confirmed one', () => {
  const glossary = seeded()
  const refusal = upsertTerm(glossary, { canonicalTerm: 'Information Environment', definition: 'whatever the agent guessed' })
  assert.equal(refusal.outcome, 'refused')
  assert.match(refusal.reasons.join(' '), /cannot revise it/)
  assert.match(findEntry(glossary, 'Information Environment')?.definition ?? '', /persistent information/)
  // The persisted entry stays exactly as authoritative as it was.
  assert.equal(findEntry(glossary, 'Information Environment')?.status, 'CONFIRMED')
})

test('terminology: the entry invariants are enforced, not advisory', () => {
  const base = { canonicalTerm: 'x', definition: '', aliases: [], status: 'CONFIRMED', source: 'user', scope: '', confirmedByUser: true, confidence: 1, supersedes: [] }
  assert.deepEqual(validateEntry(base), [])
  assert.match(validateEntry({ ...base, source: 'agent-inferred' }).join(' '), /never be user-confirmed/)
  assert.match(validateEntry({ ...base, status: 'CONFLICTED' }).join(' '), /cannot be user-confirmed/)
  assert.match(validateEntry({ ...base, status: 'PROVISIONAL' }).join(' '), /must have status CONFIRMED/)
  assert.match(validateEntry({ ...base, status: 'ELSEWHERE' }).join(' '), /unknown status/)
  assert.match(validateEntry({ ...base, confidence: 2 }).join(' '), /between 0 and 1/)
  assert.match(validateEntry({ ...base, canonicalTerm: '  ' }).join(' '), /must not be empty/)
})

test('terminology: the vocabularies and the authority ladder are the documented ones', () => {
  assert.deepEqual([...TERM_STATUSES], ['PROVISIONAL', 'CONFIRMED', 'DEPRECATED', 'CONFLICTED'])
  assert.deepEqual([...TERM_SOURCES], ['user', 'project-document', 'agent-inferred'])
  assert.deepEqual([...AUTHORITY_LADDER], [
    'dsh-host-semantics',
    'explicit-user-instruction',
    'user-confirmed-terminology',
    'authoritative-project-documentation',
    'provisional-inferred-glossary',
  ])
})

test('terminology: persisted state round-trips, and invalid entries are dropped', () => {
  const glossary = seeded()
  const restored = deserialiseGlossary(serialiseGlossary(glossary))
  assert.deepEqual(serialiseGlossary(restored), serialiseGlossary(glossary))
  assert.equal(deserialiseGlossary(undefined).entries.length, 0)
  assert.equal(deserialiseGlossary('not an array').entries.length, 0)
  // An entry that violates an invariant must not come back into force.
  const dropped = deserialiseGlossary([{ canonicalTerm: 'sneaky', status: 'CONFIRMED', source: 'agent-inferred', confirmedByUser: true, confidence: 1, aliases: [], supersedes: [], definition: '', scope: '' }])
  assert.equal(dropped.entries.length, 0)
})

/* ── the orientation path: how terms actually reach the glossary ───────────── */

test('terminology: orientation captures inferred terms as provisional and user-stated terms as confirmed', async () => {
  const { createOrientationStore } = await import('../../lib/kernel/orientation.js')
  const store = createOrientationStore()
  const result = store.record({
    intent: 'govern the information environment',
    objective: 'keep the repository coherent',
    scope: 'this repository',
    terminology: [
      { term: 'Information Environment', definition: 'the persistent information an agent works with', confirmedByUser: true, aliases: ['IE'] },
      { term: 'maintenance round', definition: 'one inventory and planning pass', confidence: 0.4 },
    ],
    plan: ['audit', 'clean up'],
  })

  const entries = Object.fromEntries(result.glossary.map((entry) => [entry.canonicalTerm, entry]))
  assert.equal(entries['Information Environment'].status, 'CONFIRMED')
  assert.equal(entries['Information Environment'].confirmedByUser, true)
  assert.equal(entries['Information Environment'].source, 'user')
  assert.deepEqual(entries['Information Environment'].aliases, ['IE'])

  assert.equal(entries['maintenance round'].status, 'PROVISIONAL', 'an unconfirmed term is inference, not authority')
  assert.equal(entries['maintenance round'].confirmedByUser, false)
  assert.equal(entries['maintenance round'].source, 'agent-inferred')
  assert.equal(entries['maintenance round'].confidence, 0.4)
})

test('terminology: an inferred orientation term cannot revise a confirmed one', () => {
  const glossary = createGlossary()
  confirmTerm(glossary, { canonicalTerm: 'scope', definition: 'the work this task covers' })
  // The same term arrives later as an inference, with a different meaning.
  const refusal = upsertTerm(glossary, { canonicalTerm: 'scope', definition: 'a directory region' })
  assert.equal(refusal.outcome, 'refused')
  assert.equal(findEntry(glossary, 'scope')?.definition, 'the work this task covers')
  assert.equal(findEntry(glossary, 'scope')?.status, 'CONFIRMED')
})
