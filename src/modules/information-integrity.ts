/**
 * Module: `information-integrity` (M2).
 *
 * **Problem:** known-invalid information remains reusable.
 * **Objective:** prevent invalid information from being treated as authoritative.
 *
 * The critical requirement (handoff §8) is not that the agent *notices* an
 * error, but that after recognising invalidity the information stops being
 * usable as authoritative — and that re-promotion demands evidence or explicit
 * user confirmation rather than an assertion.
 *
 * Information-state semantics (Batch 1, 0.7.0). The module keeps six
 * distinguishable dimensions and never collapses them into one "valid" flag:
 *
 *   existence             the item is present in the environment at all
 *   status                its lifecycle position (see INFORMATION_STATUSES)
 *   authority             whether it may be presented as authoritative knowledge
 *   provenance            where it came from and on whose word
 *   supersession          what replaced it, if anything
 *   retrieval eligibility whether it may be returned by a normal/default lookup
 *
 * The operative boundary is that existence and retrieval eligibility are
 * independent: an obsolete or superseded item may remain **stored** without
 * being eligible for normal/default retrieval. `isUsableAsAuthoritative()`
 * answers the authority question and `isUsable()` the retrieval-eligibility
 * question. No retrieval system is implemented here or implied by this module.
 */

/** Valid statuses (handoff §5). */
export const INFORMATION_STATUSES = Object.freeze([
  'AUTHORITATIVE',
  'PROVISIONAL',
  'SUSPECT',
  'INVALID',
  'DEPRECATED',
  'SUPERSEDED',
  'PENDING_CONFIRMATION',
])

/** Terminal dispositions applied when invalid information is dealt with. */
export const INFORMATION_DISPOSITIONS = Object.freeze(['CORRECTED', 'REPLACED', 'QUARANTINED', 'REMOVED'])

/** Statuses that must never be presented as authoritative project knowledge. */
export const NON_AUTHORITATIVE_STATUSES = Object.freeze([
  'PROVISIONAL',
  'SUSPECT',
  'INVALID',
  'DEPRECATED',
  'SUPERSEDED',
  'PENDING_CONFIRMATION',
])

/**
 * Permitted status transitions. Anything absent is refused outright, so the
 * model cannot invent an escalation path.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  AUTHORITATIVE: Object.freeze(['SUSPECT', 'DEPRECATED', 'SUPERSEDED', 'INVALID', 'PENDING_CONFIRMATION']),
  PROVISIONAL: Object.freeze(['AUTHORITATIVE', 'SUSPECT', 'INVALID', 'DEPRECATED', 'SUPERSEDED', 'PENDING_CONFIRMATION']),
  PENDING_CONFIRMATION: Object.freeze(['AUTHORITATIVE', 'SUSPECT', 'INVALID', 'DEPRECATED', 'SUPERSEDED']),
  SUSPECT: Object.freeze(['AUTHORITATIVE', 'PROVISIONAL', 'INVALID', 'DEPRECATED', 'SUPERSEDED', 'PENDING_CONFIRMATION']),
  INVALID: Object.freeze(['AUTHORITATIVE', 'PROVISIONAL']),
  DEPRECATED: Object.freeze(['AUTHORITATIVE', 'PROVISIONAL']),
  SUPERSEDED: Object.freeze(['AUTHORITATIVE', 'PROVISIONAL']),
})

export interface InformationRecord {
  id: string
  status: string
  value: string
  provenance: string
  disposition: string | null
  revision: number
  /**
   * The text a correction or replacement disposed of.
   *
   * Retained because reintroduction detection must still recognise the *stale* text:
   * after `CORRECTED`, `value` holds the replacement, so without this the original —
   * the very thing that must not come back — would be undetectable.
   */
  disposedValue?: string
}

export function createRecord(input: {
  id: string
  value?: string
  status?: string
  provenance?: string
}): InformationRecord {
  const status = input.status ?? 'PROVISIONAL'
  if (!INFORMATION_STATUSES.includes(status)) throw new Error(`unknown information status "${status}"`)
  return {
    id: input.id,
    status,
    value: input.value ?? '',
    provenance: input.provenance ?? '',
    disposition: null,
    revision: 1,
  }
}

/**
 * Attempt a status transition.
 *
 * Promotion to `AUTHORITATIVE` always requires evidence or explicit user
 * confirmation. This is the mechanical expression of PR-03: invalidity cannot be
 * undone by assertion.
 */
export function transition(
  record: InformationRecord,
  to: string,
  justification: { evidence?: string, userConfirmation?: boolean } = {},
): { ok: true, record: InformationRecord } | { ok: false, reason: string } {
  if (!INFORMATION_STATUSES.includes(to)) return { ok: false, reason: `unknown information status "${to}"` }

  const allowed = ALLOWED_TRANSITIONS[record.status] ?? []
  if (!allowed.includes(to)) {
    return { ok: false, reason: `transition ${record.status} -> ${to} is not permitted` }
  }

  const hasEvidence = typeof justification.evidence === 'string' && justification.evidence.trim() !== ''
  const hasConfirmation = justification.userConfirmation === true

  if (to === 'AUTHORITATIVE' && !hasEvidence && !hasConfirmation) {
    return {
      ok: false,
      reason: `promoting ${record.status} -> AUTHORITATIVE requires evidence or explicit user confirmation`,
    }
  }

  return {
    ok: true,
    record: {
      ...record,
      status: to,
      disposition: null,
      revision: record.revision + 1,
    },
  }
}

/**
 * Apply a terminal disposition, which also drops the record out of the
 * authoritative set.
 */
export function dispose(
  record: InformationRecord,
  disposition: 'CORRECTED' | 'REPLACED' | 'QUARANTINED' | 'REMOVED',
  replacement = '',
): InformationRecord {
  if (!INFORMATION_DISPOSITIONS.includes(disposition)) throw new Error(`unknown disposition "${disposition}"`)
  const replacesValue = disposition === 'CORRECTED' || disposition === 'REPLACED'
  return {
    ...record,
    status: 'INVALID',
    disposition,
    value: replacesValue ? replacement : record.value,
    ...(replacesValue ? { disposedValue: record.value } : {}),
    revision: record.revision + 1,
  }
}

/**
 * Whether a record may be treated as authoritative project knowledge.
 */
export function isUsableAsAuthoritative(record: InformationRecord): boolean {
  return record.status === 'AUTHORITATIVE' && record.disposition === null
}

/**
 * Whether a record may be used at all (authoritative or provisional).
 */
export function isUsable(record: InformationRecord): boolean {
  return isUsableAsAuthoritative(record) || (record.status === 'PROVISIONAL' && record.disposition === null)
}

/**
 * Detect re-introduction of known-invalid content: an incoming value that
 * matches the value of a record already marked invalid, deprecated, or
 * superseded.
 *
 * This is the `information_reintroduced` diagnostic (§12) and the concrete form
 * of the handoff's §8 "reintroduced stale content" case.
 *
 * @returns the offending record, or null when clean.
 */
export function findReintroduced(records: readonly InformationRecord[], incomingValue: string): InformationRecord | null {
  const needle = incomingValue.trim().toLowerCase()
  if (needle === '') return null
  for (const record of records) {
    if (record.status === 'AUTHORITATIVE') continue
    if (!['INVALID', 'DEPRECATED', 'SUPERSEDED'].includes(record.status)) continue
    // Match the current value or the text a correction displaced, so a corrected claim
    // is still recognised if it is reintroduced.
    const candidates = [record.value, record.disposedValue ?? '']
    if (candidates.some((candidate) => candidate.trim().toLowerCase() === needle)) return record
  }
  return null
}

/** The §6 module descriptor. */
export const informationIntegrityModule = Object.freeze({
  id: 'information-integrity',
  version: '0.2.0',
  problem: 'known-invalid information remains reusable',
  objective: 'prevent invalid information from being treated as authoritative',
  principles: Object.freeze([
    'Treat project information as having a status, and keep that status explicit.',
    'Delete information you have established is wrong. Never leave it in place annotated as wrong.',
    'Delete outdated and superseded content as well, except in a software development project, where version history matters: there, mark it explicitly as outdated instead of removing it.',
    'When the environment reports maintenance as due, run one maintenance round at the next safe boundary and report its proposals.',
    'Never present invalid, deprecated, superseded, suspect, or unconfirmed information as authoritative.',
    'Re-promoting deleted or invalidated information requires new evidence or explicit user confirmation.',
  ]),
  prompt: 'When something written down is wrong, remove it at the source; a later reader must not be able to encounter the old claim on its own.',
  dependencies: Object.freeze(['project-governance']),
  risk: 'medium',
  enabledByDefault: true,
  addresses: Object.freeze(['FC-2.3']),
})

/* ── the ledger: the runtime's working set over the canonical records (R8-02) ── */

/**
 * The per-agent information ledger.
 *
 * It holds the canonical `InformationRecord`s, so the runtime path and the persisted
 * path share one model (R8-02 §6) — the ledger is what the tools mutate and what the
 * durable snapshot round-trips, and no second representation is introduced.
 */
export interface InformationLedger {
  records: InformationRecord[]
}

/** An empty ledger. */
export function createLedger(): InformationLedger {
  return { records: [] }
}

/** Find a record by id. */
export function findRecord(ledger: InformationLedger, id: string): InformationRecord | undefined {
  return ledger.records.find((record) => record.id === id)
}

/**
 * Record information, or replace the record of the same id.
 *
 * The caller supplies *what is claimed*; authority is not a parameter. A new record
 * starts `PROVISIONAL`, and any later promotion goes through
 * {@link applyTransition}, whose `AUTHORITATIVE` rule cannot be satisfied by the model
 * alone (R8-01's boundary, applied to information).
 */
export function addRecord(
  ledger: InformationLedger,
  input: { id: string, value: string, provenance?: string, status?: string },
): InformationRecord {
  const existing = findRecord(ledger, input.id)
  const record = createRecord({
    id: input.id,
    value: input.value,
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
    status: input.status ?? existing?.status ?? 'PROVISIONAL',
  })
  if (existing === undefined) ledger.records.push(record)
  else ledger.records[ledger.records.indexOf(existing)] = { ...record, revision: existing.revision + 1 }
  return findRecord(ledger, input.id) as InformationRecord
}

/**
 * Apply a lifecycle transition.
 *
 * `justification.userConfirmation` is **not** reachable from model input: the caller
 * decides. The host entry point passes it only for a call the host has already routed
 * through its approval service, so a model cannot promote its own claim to authority
 * by asserting consent.
 */
export function applyTransition(
  ledger: InformationLedger,
  id: string,
  to: string,
  justification: { evidence?: string, userConfirmation?: boolean } = {},
): { ok: boolean, record?: InformationRecord, reason?: string } {
  const existing = findRecord(ledger, id)
  if (existing === undefined) return { ok: false, reason: `no information record with id "${id}"` }
  const result = transition(existing, to, justification)
  if (!result.ok) return { ok: false, reason: result.reason }
  ledger.records[ledger.records.indexOf(existing)] = result.record
  return { ok: true, record: result.record }
}

/** Dispose a record (the D14 policy), leaving its provenance and disposition intact. */
export function disposeRecord(
  ledger: InformationLedger,
  id: string,
  disposition: 'CORRECTED' | 'REPLACED' | 'QUARANTINED' | 'REMOVED',
  replacement = '',
): { ok: boolean, record?: InformationRecord, reason?: string } {
  const existing = findRecord(ledger, id)
  if (existing === undefined) return { ok: false, reason: `no information record with id "${id}"` }
  const next = dispose(existing, disposition, replacement)
  ledger.records[ledger.records.indexOf(existing)] = next
  return { ok: true, record: next }
}

/**
 * Detect an attempt to reuse a disposed or non-authoritative value.
 *
 * This is the runtime's check, run at the point a persistent write is proposed — the
 * earliest seam the host gives IEG that can see the incoming content. It reports; it
 * does not silently repair, and it never claims the stale value was rewritten.
 */
export function reintroductionOf(ledger: InformationLedger, incoming: string): InformationRecord | null {
  return findReintroduced(ledger.records, incoming)
}

/** The records that may be presented as current guidance. */
export function authoritativeRecords(ledger: InformationLedger): InformationRecord[] {
  return ledger.records.filter(isUsableAsAuthoritative)
}

/** A serialisable snapshot for durable storage. */
export function serialiseLedger(ledger: InformationLedger): InformationRecord[] {
  return ledger.records.map((record) => ({ ...record }))
}

/** Restore a ledger, dropping entries that are not well formed. */
export function deserialiseLedger(stored: unknown): InformationLedger {
  const ledger = createLedger()
  if (!Array.isArray(stored)) return ledger
  for (const raw of stored) {
    if (typeof raw !== 'object' || raw === null) continue
    const candidate = raw as InformationRecord
    if (typeof candidate.id !== 'string' || candidate.id.trim() === '') continue
    if (!INFORMATION_STATUSES.includes(String(candidate.status))) continue
    ledger.records.push({
      id: candidate.id,
      status: String(candidate.status),
      value: String(candidate.value ?? ''),
      provenance: String(candidate.provenance ?? ''),
      disposition: candidate.disposition === undefined || candidate.disposition === null ? null : String(candidate.disposition),
      revision: Number.isFinite(candidate.revision) ? Number(candidate.revision) : 1,
      ...(typeof candidate.disposedValue === 'string' ? { disposedValue: candidate.disposedValue } : {}),
    })
  }
  return ledger
}
