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
export declare const INFORMATION_STATUSES: readonly string[];
/** Terminal dispositions applied when invalid information is dealt with. */
export declare const INFORMATION_DISPOSITIONS: readonly string[];
/** Statuses that must never be presented as authoritative project knowledge. */
export declare const NON_AUTHORITATIVE_STATUSES: readonly string[];
export interface InformationRecord {
    id: string;
    status: string;
    value: string;
    provenance: string;
    disposition: string | null;
    revision: number;
    /**
     * The text a correction or replacement disposed of.
     *
     * Retained because reintroduction detection must still recognise the *stale* text:
     * after `CORRECTED`, `value` holds the replacement, so without this the original —
     * the very thing that must not come back — would be undetectable.
     */
    disposedValue?: string;
}
export declare function createRecord(input: {
    id: string;
    value?: string;
    status?: string;
    provenance?: string;
}): InformationRecord;
/**
 * Attempt a status transition.
 *
 * Promotion to `AUTHORITATIVE` always requires evidence or explicit user
 * confirmation. This is the mechanical expression of PR-03: invalidity cannot be
 * undone by assertion.
 */
export declare function transition(record: InformationRecord, to: string, justification?: {
    evidence?: string;
    userConfirmation?: boolean;
}): {
    ok: true;
    record: InformationRecord;
} | {
    ok: false;
    reason: string;
};
/**
 * Apply a terminal disposition, which also drops the record out of the
 * authoritative set.
 */
export declare function dispose(record: InformationRecord, disposition: 'CORRECTED' | 'REPLACED' | 'QUARANTINED' | 'REMOVED', replacement?: string): InformationRecord;
/**
 * Whether a record may be treated as authoritative project knowledge.
 */
export declare function isUsableAsAuthoritative(record: InformationRecord): boolean;
/**
 * Whether a record may be used at all (authoritative or provisional).
 */
export declare function isUsable(record: InformationRecord): boolean;
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
export declare function findReintroduced(records: readonly InformationRecord[], incomingValue: string): InformationRecord | null;
/** The §6 module descriptor. */
export declare const informationIntegrityModule: Readonly<{
    id: "information-integrity";
    version: "0.2.0";
    problem: "known-invalid information remains reusable";
    objective: "prevent invalid information from being treated as authoritative";
    principles: readonly string[];
    prompt: "When something written down is wrong, remove it at the source; a later reader must not be able to encounter the old claim on its own.";
    dependencies: readonly string[];
    risk: "medium";
    enabledByDefault: true;
    addresses: readonly string[];
}>;
/**
 * The per-agent information ledger.
 *
 * It holds the canonical `InformationRecord`s, so the runtime path and the persisted
 * path share one model (R8-02 §6) — the ledger is what the tools mutate and what the
 * durable snapshot round-trips, and no second representation is introduced.
 */
export interface InformationLedger {
    records: InformationRecord[];
}
/** An empty ledger. */
export declare function createLedger(): InformationLedger;
/** Find a record by id. */
export declare function findRecord(ledger: InformationLedger, id: string): InformationRecord | undefined;
/**
 * Record information, or replace the record of the same id.
 *
 * The caller supplies *what is claimed*; authority is not a parameter. A new record
 * starts `PROVISIONAL`, and any later promotion goes through
 * {@link applyTransition}, whose `AUTHORITATIVE` rule cannot be satisfied by the model
 * alone (R8-01's boundary, applied to information).
 */
export declare function addRecord(ledger: InformationLedger, input: {
    id: string;
    value: string;
    provenance?: string;
    status?: string;
}): InformationRecord;
/**
 * Apply a lifecycle transition.
 *
 * `justification.userConfirmation` is **not** reachable from model input: the caller
 * decides. The host entry point passes it only for a call the host has already routed
 * through its approval service, so a model cannot promote its own claim to authority
 * by asserting consent.
 */
export declare function applyTransition(ledger: InformationLedger, id: string, to: string, justification?: {
    evidence?: string;
    userConfirmation?: boolean;
}): {
    ok: boolean;
    record?: InformationRecord;
    reason?: string;
};
/** Dispose a record (the D14 policy), leaving its provenance and disposition intact. */
export declare function disposeRecord(ledger: InformationLedger, id: string, disposition: 'CORRECTED' | 'REPLACED' | 'QUARANTINED' | 'REMOVED', replacement?: string): {
    ok: boolean;
    record?: InformationRecord;
    reason?: string;
};
/**
 * Detect an attempt to reuse a disposed or non-authoritative value.
 *
 * This is the runtime's check, run at the point a persistent write is proposed — the
 * earliest seam the host gives IEG that can see the incoming content. It reports; it
 * does not silently repair, and it never claims the stale value was rewritten.
 */
export declare function reintroductionOf(ledger: InformationLedger, incoming: string): InformationRecord | null;
/** The records that may be presented as current guidance. */
export declare function authoritativeRecords(ledger: InformationLedger): InformationRecord[];
/** A serialisable snapshot for durable storage. */
export declare function serialiseLedger(ledger: InformationLedger): InformationRecord[];
/** Restore a ledger, dropping entries that are not well formed. */
export declare function deserialiseLedger(stored: unknown): InformationLedger;
