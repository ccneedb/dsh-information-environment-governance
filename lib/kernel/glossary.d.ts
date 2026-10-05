/**
 * IEG kernel — the project-local glossary (Batch 7 Phases 7-9).
 *
 * Terminology governance exists to keep *meaning* consistent across task
 * communication, project state, generated artifacts, documentation and later
 * decisions. It is not a language-policing mechanism, and this module is written so
 * that it cannot become one:
 *
 * - an **alias** is accepted silently. Nothing here can block, warn or nag because
 *   the user chose a harmless synonym;
 * - a **conflict** is reported, never resolved by picking a meaning;
 * - **user authority is structural**, not a convention: an agent-inferred entry can
 *   never reach `CONFIRMED`, and an existing user-confirmed entry can never be
 *   overwritten by inference. Those are enforced by {@link upsertTerm}, not by the
 *   prompt asking nicely.
 *
 * The persistence lives in the existing governance state (Batch 7 Phase 7: reuse the
 * project ontology instead of adding a terminology subsystem), so this module holds
 * only the model and its rules and stays pure and testable without a host.
 */
/** The four terminology states. Nothing outside this set may be stored. */
export declare const TERM_STATUSES: readonly string[];
/** Where an entry came from. Only `user` and `project-document` carry real authority. */
export declare const TERM_SOURCES: readonly string[];
/**
 * The authority ladder (Batch 7 Phase 9), highest first.
 *
 * A lower rung never overrides a higher one, and nothing below rung 2 may revise
 * glossary state.
 */
export declare const AUTHORITY_LADDER: readonly string[];
/** One glossary entry — exactly the fields Batch 7 Phase 7 requires. */
export interface GlossaryEntry {
    canonicalTerm: string;
    definition: string;
    aliases: string[];
    status: string;
    source: string;
    /** The project area the term belongs to; `''` means project-wide. */
    scope: string;
    confirmedByUser: boolean;
    /** Meaningful only while `PROVISIONAL`; 1 for a confirmed entry. */
    confidence: number;
    /** Canonical terms this entry replaces. */
    supersedes: string[];
}
/** Input to {@link upsertTerm}; `canonicalTerm` is the only required field. */
export interface GlossaryTermInput {
    canonicalTerm: string;
    definition?: string;
    aliases?: string[];
    status?: string;
    source?: string;
    scope?: string;
    confirmedByUser?: boolean;
    confidence?: number;
    supersedes?: string[];
}
/** What an upsert did, so a caller can report it rather than guess. */
export interface UpsertResult {
    entry: GlossaryEntry;
    outcome: 'created' | 'updated' | 'refused' | 'unchanged';
    /** Why a change was refused, or what was normalized, in order. */
    reasons: string[];
}
/** Normalisation is case- and whitespace-insensitive; it is never semantic. */
export declare function normaliseTerm(term: string): string;
/** The invariants that make the authority model real rather than aspirational. */
export declare function validateEntry(entry: GlossaryEntry): string[];
/** A glossary: entries plus lookup, with no hidden authority of its own. */
export interface Glossary {
    entries: GlossaryEntry[];
}
/** An empty glossary. */
export declare function createGlossary(): Glossary;
/** Find one entry by canonical term. */
export declare function findEntry(glossary: Glossary, canonicalTerm: string): GlossaryEntry | undefined;
/**
 * Create or revise an entry, honouring user authority.
 *
 * Refusals are explicit and carry their reason:
 *
 * - **inference may never upgrade a user-confirmed or documented entry.** An
 *   agent-inferred upsert of an existing `CONFIRMED`/`DEPRECATED` entry is refused
 *   outright, which is the Phase 9 invariant in code;
 * - a `user` (or `project-document`) upsert may revise anything;
 * - an inferred entry is `PROVISIONAL` with `confirmedByUser: false`, always.
 */
export declare function upsertTerm(glossary: Glossary, input: GlossaryTermInput): UpsertResult;
/**
 * Apply an explicit user clarification or correction.
 *
 * This is the only path that creates a `confirmedByUser` entry, and it may revise a
 * provisional inferred one — the precedence rule of Phase 9 rung 2 over rung 5.
 */
export declare function confirmTerm(glossary: Glossary, input: GlossaryTermInput): UpsertResult;
/** Retire a term without deleting its history. */
export declare function deprecateTerm(glossary: Glossary, canonicalTerm: string, supersededBy?: string): UpsertResult;
/** Mark an entry conflicted. Recorded, never resolved by choosing a meaning. */
export declare function conflictTerm(glossary: Glossary, canonicalTerm: string, reason: string): UpsertResult;
/** How a term the user or an artifact used maps onto the glossary. */
export type TermMatch = {
    kind: 'exact';
    entry: GlossaryEntry;
} | {
    kind: 'alias';
    entry: GlossaryEntry;
    matched: string;
} | {
    kind: 'deprecated';
    entry: GlossaryEntry;
    matched: string;
} | {
    kind: 'ambiguous';
    matched: string;
    candidates: GlossaryEntry[];
} | {
    kind: 'conflicted';
    entry: GlossaryEntry;
    matched: string;
} | {
    kind: 'unknown';
    matched: string;
};
/**
 * Resolve one used term — the deterministic core of the three behaviour tiers.
 *
 * The *kind* is the whole answer, and it is deliberately not a verdict about the
 * user: `alias` means accept silently (Tier 1), `ambiguous` means surface the
 * readings (Tier 2), `conflicted`/`deprecated` mean surface the problem (Tier 3).
 * Nothing here can decide that the user is wrong, and no kind blocks work.
 */
export declare function resolveTerm(glossary: Glossary, used: string): TermMatch;
/** Every entry whose status makes it unsafe to present as current guidance. */
export declare function nonCurrentEntries(glossary: Glossary): GlossaryEntry[];
/** The glossary as a serializable value for the state document. */
export declare function serialiseGlossary(glossary: Glossary): GlossaryEntry[];
/** Restore a glossary from persisted state, dropping anything that no longer validates. */
export declare function deserialiseGlossary(stored: unknown): Glossary;
/** The kernel's export shape, mirroring the other modules (Part B §24). */
export declare const glossaryKernel: Readonly<{
    name: "glossary";
    version: "0.1.0";
    statuses: readonly string[];
    sources: readonly string[];
    authorityLadder: readonly string[];
}>;
