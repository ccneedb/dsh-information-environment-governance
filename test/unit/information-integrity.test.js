import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createRecord,
  transition,
  dispose,
  isUsableAsAuthoritative,
  isUsable,
  findReintroduced,
  INFORMATION_STATUSES,
} from '../../lib/modules/information-integrity.js'

test('a new record is provisional, never authoritative by default', () => {
  const record = createRecord({ id: 'r1', value: 'the port is 8080' })
  assert.equal(record.status, 'PROVISIONAL')
  assert.equal(isUsableAsAuthoritative(record), false)
  assert.equal(isUsable(record), true)
})

test('an unknown status is refused at creation', () => {
  assert.throws(() => createRecord({ id: 'r1', status: 'TRUST_ME' }), /unknown information status/)
})

test('the published status vocabulary is complete', () => {
  assert.deepEqual(INFORMATION_STATUSES, [
    'AUTHORITATIVE',
    'PROVISIONAL',
    'SUSPECT',
    'INVALID',
    'DEPRECATED',
    'SUPERSEDED',
    'PENDING_CONFIRMATION',
  ])
})

test('an unspecified transition is refused rather than invented', () => {
  const record = createRecord({ id: 'r1', status: 'AUTHORITATIVE' })
  const result = transition(record, 'PROVISIONAL')
  assert.equal(result.ok, false)
  assert.match(/** @type {any} */ (result).reason, /not permitted/)
})

test('the critical PR-03 case: invalidity cannot be undone by assertion', () => {
  let record = createRecord({ id: 'r1', status: 'AUTHORITATIVE', value: 'the API is v1' })
  record = /** @type {any} */ (transition(record, 'INVALID')).record
  assert.equal(record.status, 'INVALID')
  assert.equal(isUsableAsAuthoritative(record), false)
  assert.equal(isUsable(record), false)

  const bare = transition(record, 'AUTHORITATIVE')
  assert.equal(bare.ok, false)
  assert.match(/** @type {any} */ (bare).reason, /requires explicit user confirmation/)

  // IEG-16: model-authored evidence is an assertion, not authority.
  const withEvidence = transition(record, 'AUTHORITATIVE', { evidence: 'the API is v2 now' })
  assert.equal(withEvidence.ok, false)
  assert.match(/** @type {any} */ (withEvidence).reason, /model-authored evidence note is not confirmation/)

  // Only the approval-routed caller can supply userConfirmation.
  const withConfirmation = transition(record, 'AUTHORITATIVE', { userConfirmation: true, evidence: 'the user confirmed it' })
  assert.equal(withConfirmation.ok, true)
  assert.equal(isUsableAsAuthoritative(/** @type {any} */ (withConfirmation).record), true)
})

test('promotion to authoritative accepts user confirmation as justification', () => {
  let record = createRecord({ id: 'r1', status: 'SUSPECT' })
  const confirmed = transition(record, 'AUTHORITATIVE', { userConfirmation: true })
  assert.equal(confirmed.ok, true)
})

test('blank or model-authored evidence does not promote to authoritative', () => {
  const record = createRecord({ id: 'r1', status: 'INVALID' })
  const blank = transition(record, 'AUTHORITATIVE', { evidence: '   ' })
  assert.equal(blank.ok, false)
  assert.match(/** @type {any} */ (blank).reason, /requires explicit user confirmation/)
})

test('deprecation and supersession remove authoritative standing immediately', () => {
  for (const status of ['DEPRECATED', 'SUPERSEDED', 'SUSPECT', 'PENDING_CONFIRMATION']) {
    const record = createRecord({ id: 'r1', status: 'AUTHORITATIVE' })
    const result = transition(record, status)
    assert.equal(result.ok, true, `AUTHORITATIVE -> ${status} should be permitted`)
    assert.equal(isUsableAsAuthoritative(/** @type {any} */ (result).record), false)
  }
})

test('a disposition marks the record invalid and non-authoritative', () => {
  const record = createRecord({ id: 'r1', status: 'AUTHORITATIVE', value: 'stale' })
  const corrected = dispose(record, 'CORRECTED', 'fresh')
  assert.equal(corrected.status, 'INVALID')
  assert.equal(corrected.disposition, 'CORRECTED')
  assert.equal(corrected.value, 'fresh')
  assert.equal(isUsableAsAuthoritative(corrected), false)

  const quarantined = dispose(record, 'QUARANTINED')
  assert.equal(quarantined.disposition, 'QUARANTINED')
  assert.equal(quarantined.value, 'stale')
  assert.throws(() => dispose(record, /** @type {any} */ ('BURNED')), /unknown disposition/)
})

test('reintroduced invalid content is detected', () => {
  let invalid = createRecord({ id: 'r1', status: 'AUTHORITATIVE', value: 'the endpoint is /v1/chat' })
  invalid = /** @type {any} */ (transition(invalid, 'INVALID')).record

  const authoritative = createRecord({ id: 'r2', status: 'AUTHORITATIVE', value: 'the endpoint is /v2/chat' })

  assert.equal(findReintroduced([invalid, authoritative], 'the endpoint is /v1/chat'), invalid)
  // Case and surrounding whitespace do not evade the check.
  assert.equal(findReintroduced([invalid], '  THE ENDPOINT IS /V1/CHAT  '), invalid)
  assert.equal(findReintroduced([invalid, authoritative], 'the endpoint is /v2/chat'), null)
  assert.equal(findReintroduced([invalid], ''), null)
})
