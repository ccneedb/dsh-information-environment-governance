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
export const TERM_STATUSES = Object.freeze([
    'PROVISIONAL',
    'CONFIRMED',
    'DEPRECATED',
    'CONFLICTED',
]);
/** Where an entry came from. Only `user` and `project-document` carry real authority. */
export const TERM_SOURCES = Object.freeze([
    'user',
    'project-document',
    'agent-inferred',
]);
/**
 * The authority ladder (Batch 7 Phase 9), highest first.
 *
 * A lower rung never overrides a higher one, and nothing below rung 2 may revise
 * glossary state.
 */
export const AUTHORITY_LADDER = Object.freeze([
    'dsh-host-semantics',
    'explicit-user-instruction',
    'user-confirmed-terminology',
    'authoritative-project-documentation',
    'provisional-inferred-glossary',
]);
/** Normalisation is case- and whitespace-insensitive; it is never semantic. */
export function normaliseTerm(term) {
    return term.trim().replace(/\s+/g, ' ').toLowerCase();
}
/** The invariants that make the authority model real rather than aspirational. */
export function validateEntry(entry) {
    const problems = [];
    if (entry.canonicalTerm.trim() === '')
        problems.push('canonicalTerm must not be empty');
    if (!TERM_STATUSES.includes(entry.status))
        problems.push(`unknown status "${entry.status}"`);
    if (!TERM_SOURCES.includes(entry.source))
        problems.push(`unknown source "${entry.source}"`);
    if (entry.confirmedByUser && entry.source === 'agent-inferred') {
        problems.push('an agent-inferred entry can never be user-confirmed');
    }
    if (entry.confirmedByUser && entry.status !== 'CONFIRMED') {
        problems.push('a user-confirmed entry must have status CONFIRMED');
    }
    if (entry.status === 'CONFLICTED' && entry.confirmedByUser) {
        problems.push('a conflicted entry cannot be user-confirmed');
    }
    if (!(entry.confidence >= 0 && entry.confidence <= 1))
        problems.push('confidence must be between 0 and 1');
    return problems;
}
/** An empty glossary. */
export function createGlossary() {
    return { entries: [] };
}
/** Find one entry by canonical term. */
export function findEntry(glossary, canonicalTerm) {
    const key = normaliseTerm(canonicalTerm);
    return glossary.entries.find((entry) => normaliseTerm(entry.canonicalTerm) === key);
}
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
export function upsertTerm(glossary, input) {
    const source = input.source ?? 'agent-inferred';
    const reasons = [];
    const existing = findEntry(glossary, input.canonicalTerm);
    const definition = input.definition ?? existing?.definition ?? '';
    if (source === 'agent-inferred' && existing !== undefined && (existing.confirmedByUser || existing.status === 'CONFIRMED' || existing.status === 'DEPRECATED')) {
        reasons.push(`${existing.canonicalTerm} is ${existing.status}${existing.confirmedByUser ? ' (user-confirmed)' : ''}; an inferred entry cannot revise it`);
        return { entry: existing, outcome: 'refused', reasons };
    }
    const confirmedByUser = source === 'user' ? input.confirmedByUser === true : false;
    const status = confirmedByUser
        ? 'CONFIRMED'
        : (input.status ?? (source === 'agent-inferred' ? 'PROVISIONAL' : 'CONFIRMED'));
    const entry = {
        canonicalTerm: (existing?.canonicalTerm ?? input.canonicalTerm).trim(),
        definition,
        aliases: unique([...(existing?.aliases ?? []), ...(input.aliases ?? [])]),
        status,
        source,
        scope: input.scope ?? existing?.scope ?? '',
        confirmedByUser,
        confidence: status === 'CONFIRMED' ? 1 : (input.confidence ?? existing?.confidence ?? 0.5),
        supersedes: unique([...(existing?.supersedes ?? []), ...(input.supersedes ?? [])]),
    };
    const problems = validateEntry(entry);
    if (problems.length > 0) {
        return { entry: existing ?? entry, outcome: 'refused', reasons: problems };
    }
    if (existing !== undefined && sameEntry(existing, entry)) {
        return { entry: existing, outcome: 'unchanged', reasons };
    }
    if (existing === undefined)
        glossary.entries.push(entry);
    else
        glossary.entries[glossary.entries.indexOf(existing)] = entry;
    if (source !== 'agent-inferred')
        reasons.push(`recorded from ${source}`);
    return { entry, outcome: existing === undefined ? 'created' : 'updated', reasons };
}
/**
 * Apply an explicit user clarification or correction.
 *
 * This is the only path that creates a `confirmedByUser` entry, and it may revise a
 * provisional inferred one — the precedence rule of Phase 9 rung 2 over rung 5.
 */
export function confirmTerm(glossary, input) {
    return upsertTerm(glossary, { ...input, source: 'user', confirmedByUser: true });
}
/** Retire a term without deleting its history. */
export function deprecateTerm(glossary, canonicalTerm, supersededBy) {
    const existing = findEntry(glossary, canonicalTerm);
    if (existing === undefined) {
        return { entry: { canonicalTerm, definition: '', aliases: [], status: 'DEPRECATED', source: 'user', scope: '', confirmedByUser: false, confidence: 1, supersedes: [] }, outcome: 'refused', reasons: [`${canonicalTerm} is not in the glossary`] };
    }
    const entry = {
        ...existing,
        status: 'DEPRECATED',
        confirmedByUser: false,
        supersedes: unique([...existing.supersedes, ...(supersededBy === undefined ? [] : [supersededBy])]),
    };
    glossary.entries[glossary.entries.indexOf(existing)] = entry;
    return { entry, outcome: 'updated', reasons: supersededBy === undefined ? [] : [`superseded by ${supersededBy}`] };
}
/** Mark an entry conflicted. Recorded, never resolved by choosing a meaning. */
export function conflictTerm(glossary, canonicalTerm, reason) {
    const existing = findEntry(glossary, canonicalTerm);
    if (existing === undefined) {
        return { entry: { canonicalTerm, definition: '', aliases: [], status: 'CONFLICTED', source: 'project-document', scope: '', confirmedByUser: false, confidence: 0.5, supersedes: [] }, outcome: 'refused', reasons: [`${canonicalTerm} is not in the glossary`, reason] };
    }
    const entry = { ...existing, status: 'CONFLICTED', confirmedByUser: false };
    glossary.entries[glossary.entries.indexOf(existing)] = entry;
    return { entry, outcome: 'updated', reasons: [reason] };
}
/**
 * Resolve one used term — the deterministic core of the three behaviour tiers.
 *
 * The *kind* is the whole answer, and it is deliberately not a verdict about the
 * user: `alias` means accept silently (Tier 1), `ambiguous` means surface the
 * readings (Tier 2), `conflicted`/`deprecated` mean surface the problem (Tier 3).
 * Nothing here can decide that the user is wrong, and no kind blocks work.
 */
export function resolveTerm(glossary, used) {
    const key = normaliseTerm(used);
    const exact = glossary.entries.find((entry) => normaliseTerm(entry.canonicalTerm) === key);
    if (exact !== undefined) {
        if (exact.status === 'CONFLICTED')
            return { kind: 'conflicted', entry: exact, matched: used };
        return { kind: 'exact', entry: exact };
    }
    const aliased = glossary.entries.filter((entry) => entry.aliases.some((alias) => normaliseTerm(alias) === key));
    const live = aliased.filter((entry) => entry.status !== 'DEPRECATED');
    if (live.length > 1)
        return { kind: 'ambiguous', matched: used, candidates: live };
    if (live.length === 1) {
        const entry = live[0];
        if (entry.status === 'CONFLICTED')
            return { kind: 'conflicted', entry, matched: used };
        return { kind: 'alias', entry, matched: used };
    }
    if (aliased.length >= 1)
        return { kind: 'deprecated', entry: aliased[0], matched: used };
    return { kind: 'unknown', matched: used };
}
/** Every entry whose status makes it unsafe to present as current guidance. */
export function nonCurrentEntries(glossary) {
    return glossary.entries.filter((entry) => entry.status === 'DEPRECATED' || entry.status === 'CONFLICTED');
}
/** The glossary as a serializable value for the state document. */
export function serialiseGlossary(glossary) {
    return glossary.entries.map((entry) => ({ ...entry, aliases: [...entry.aliases], supersedes: [...entry.supersedes] }));
}
/** Restore a glossary from persisted state, dropping anything that no longer validates. */
export function deserialiseGlossary(stored) {
    const glossary = createGlossary();
    if (!Array.isArray(stored))
        return glossary;
    for (const raw of stored) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const entry = {
            canonicalTerm: String(raw.canonicalTerm ?? ''),
            definition: String(raw.definition ?? ''),
            aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : [],
            status: String(raw.status ?? 'PROVISIONAL'),
            source: String(raw.source ?? 'agent-inferred'),
            scope: String(raw.scope ?? ''),
            confirmedByUser: raw.confirmedByUser === true,
            confidence: Number(raw.confidence ?? 0.5),
            supersedes: Array.isArray(raw.supersedes) ? raw.supersedes.map(String) : [],
        };
        if (validateEntry(entry).length === 0)
            glossary.entries.push(entry);
    }
    return glossary;
}
function unique(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const trimmed = value.trim();
        const key = normaliseTerm(trimmed);
        if (trimmed === '' || seen.has(key))
            continue;
        seen.add(key);
        out.push(trimmed);
    }
    return out;
}
function sameEntry(a, b) {
    return JSON.stringify({ ...a, aliases: [...a.aliases].sort(), supersedes: [...a.supersedes].sort() }) ===
        JSON.stringify({ ...b, aliases: [...b.aliases].sort(), supersedes: [...b.supersedes].sort() });
}
/** The kernel's export shape, mirroring the other modules (Part B §24). */
export const glossaryKernel = Object.freeze({
    name: 'glossary',
    version: '0.1.0',
    statuses: TERM_STATUSES,
    sources: TERM_SOURCES,
    authorityLadder: AUTHORITY_LADDER,
});
