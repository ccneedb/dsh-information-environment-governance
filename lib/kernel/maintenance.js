/**
 * IEG kernel — the information environment maintenance round (Batch 6).
 *
 * Batch 5 reduced IEG to prompt management plus deterministic gates; Batch 6 asks
 * it to *maintain* the information environment as well. This module is the whole
 * of that capability's deterministic core, and it is deliberately the smallest
 * thing that can be honest about what it does.
 *
 * A round moves through the four stages `PRODUCT-SPEC` §5 / `ARCHITECTURE-SPEC`
 * §28.8 name — inventory, diagnosis, planning, execution — but this module performs
 * only the first three and **proposes**. It never writes, deletes, merges or renames
 * anything: the eight maintenance actions are *plan items* with a stated reason and
 * confidence, and every destructive one is flagged for a human decision through the
 * existing approval path. That boundary is the point — a maintenance round that
 * silently rewrote a user's documents would be exactly the unsupported capability
 * Batch 6 forbids claiming.
 *
 * Everything here is pure: given the artifacts and the authoritative facts, the
 * report is a function of them alone. Filesystem traversal belongs to the caller
 * (`src/index.ts`), so this module stays testable without a host.
 */
/** How a persistent artifact is classified. Shape mirrors Batch 6 §2 "Inventory". */
export const INVENTORY_CLASSES = Object.freeze([
    'authoritative-specification',
    'implementation-documentation',
    'configuration',
    'working-note',
    'generated-artifact',
    'historical-artifact',
    'temporary-artifact',
    'unknown-artifact',
]);
/** What the diagnosis looks at. Shape mirrors Batch 6 §2 "Diagnosis". */
export const DIAGNOSIS_DIMENSIONS = Object.freeze([
    'purpose',
    'information-role',
    'authority',
    'relevance',
    'duplication',
    'contradiction',
    'obsolescence',
]);
/** The explicit maintenance vocabulary of Batch 6 §2 — no free-form actions. */
export const MAINTENANCE_ACTIONS = Object.freeze([
    'KEEP',
    'MERGE',
    'UPDATE',
    'REPLACE',
    'DEPRECATE',
    'REMOVE',
    'LEAVE_UNCHANGED',
    'REQUIRES_REVIEW',
]);
/**
 * The actions that can destroy or rewrite information.
 *
 * A round never applies these itself; it reports them. They are also the actions a
 * caller must not treat as routine when reading a report.
 */
export const DESTRUCTIVE_ACTIONS = Object.freeze([
    'MERGE',
    'REPLACE',
    'DEPRECATE',
    'REMOVE',
]);
/**
 * Direct user instruction batches after which maintenance is marked required
 * (Batch 6 §6). Seven, and counted in `src/kernel/state.ts`.
 */
export const MAINTENANCE_BATCH_THRESHOLD = 7;
/** Below this confidence, a proposed action becomes `REQUIRES_REVIEW`. */
export const DEFAULT_REVIEW_FLOOR = 0.6;
/** Subject coverage at or above which two same-class artifacts are duplicates. */
export const DEFAULT_DUPLICATE_COVERAGE = 0.6;
/* ── inventory ──────────────────────────────────────────────────────────────── */
/** Front matter is the project's own convention: a leading `---` block. */
export function parseFrontMatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (match === null)
        return {};
    const out = {};
    for (const line of match[1].split(/\r?\n/)) {
        const separator = line.indexOf(':');
        if (separator <= 0)
            continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key !== '' && value !== '')
            out[key] = value;
    }
    return out;
}
const GENERATED = /(^|\/)(lib|dist|build|node_modules|\.ieg-verify|\.pnpm-store)(\/|$)/;
const TEMPORARY = /(^|\/)(tmp|temp|\.cache|\.turbo)(\/|$)|\.log$|\.tmp$|\.tgz$|\.tsbuildinfo$/;
const CONFIGURATION = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|cordis\.patch\.yml|tsconfig[^/]*\.json|\.github\/.*\.ya?ml)$|\.ya?ml$|\.json$/;
const HISTORICAL = /(^|\/)(CHANGELOG|HISTORY|ARCHIVE)[^/]*$|(^|\/)history\//;
const SPEC = /(^|\/)(PRODUCT-SPEC|ARCHITECTURE-SPEC|.*-SPEC|.*\.spec)\b[^/]*$/;
const DOCS = /(^|\/)(README|CONTRIBUTING|TESTING|SECURITY|MAINTENANCE[^/]*|TYPESCRIPT-MIGRATION|CODE_OF_CONDUCT|IMPLEMENTATION-VALIDATION[^/]*)[^/]*$/;
/** Signal-weighted inventory classification. Path first, then declared status. */
export function classifyInventory(path, frontMatter) {
    const reasons = [];
    const status = (frontMatter.status ?? '').toLowerCase();
    const decide = (inventory, reason) => {
        reasons.push(reason);
        return { inventory, reasons };
    };
    if (GENERATED.test(path))
        return decide('generated-artifact', 'path is a generated output tree');
    if (TEMPORARY.test(path))
        return decide('temporary-artifact', 'path or extension marks a temporary artifact');
    if (frontMatter.doc_type === 'changelog' || HISTORICAL.test(path)) {
        return decide('historical-artifact', 'path or doc_type marks an immutable history record');
    }
    if (CONFIGURATION.test(path))
        return decide('configuration', 'path is configuration');
    if (SPEC.test(path))
        return decide('authoritative-specification', 'path names a specification');
    if (DOCS.test(path))
        return decide('implementation-documentation', 'path names project documentation');
    if (status === 'draft' || frontMatter.doc_type === 'notes') {
        return decide('working-note', 'declared as a draft or working note');
    }
    return decide('unknown-artifact', 'no classification signal');
}
/** The declared authority of an artifact, from its front matter and inventory class. */
export function authorityOf(inventory, frontMatter) {
    const status = (frontMatter.status ?? '').toLowerCase();
    if (status === 'superseded' || status === 'deprecated' || status === 'retired')
        return 'historical';
    if (inventory === 'generated-artifact' || inventory === 'temporary-artifact')
        return 'unknown';
    if (inventory === 'historical-artifact')
        return 'historical';
    if (status === 'active' && frontMatter.owner !== undefined)
        return 'authoritative';
    if (inventory === 'authoritative-specification')
        return 'authoritative';
    if (inventory === 'implementation-documentation' || inventory === 'configuration')
        return 'supporting';
    return 'unknown';
}
/**
 * Classify and diagnose one artifact deterministically.
 *
 * `role` is the artifact's *functional* role, not its filename: it comes from the
 * declared `doc_type` when present, else from the inventory class. Batch 6 §4 asks
 * a creation to be judged on functional role, so the role has to be a first-class
 * value rather than something re-derived from a title at comparison time.
 */
export function classifyArtifact(input) {
    const frontMatter = parseFrontMatter(input.content);
    const { inventory, reasons } = classifyInventory(input.path, frontMatter);
    const status = (frontMatter.status ?? '').toLowerCase();
    const role = frontMatter.doc_type ?? inventory;
    const obsolete = status === 'superseded' || status === 'deprecated' || status === 'retired';
    if (frontMatter.doc_type !== undefined)
        reasons.push(`declared doc_type: ${frontMatter.doc_type}`);
    if (status !== '')
        reasons.push(`declared status: ${status}`);
    return {
        path: input.path,
        bytes: input.bytes ?? input.content.length,
        inventory,
        role,
        status,
        authority: authorityOf(inventory, frontMatter),
        frontMatter,
        headings: input.headings,
        tokens: input.tokens,
        obsolete,
        reasons,
    };
}
/* ── diagnosis and planning ─────────────────────────────────────────────────── */
/**
 * Plan maintenance for the inventoried artifacts.
 *
 * Deterministic findings only — duplication by subject coverage, version-figure
 * drift against {@link MaintenanceTruth}, and declared obsolescence. Everything a
 * confident judgement would need but the evidence does not support becomes
 * `REQUIRES_REVIEW`, and every destructive action is flagged rather than applied.
 */
export function planMaintenance(input) {
    const floor = input.reviewFloor ?? DEFAULT_REVIEW_FLOOR;
    const duplicateFloor = input.duplicateCoverage ?? DEFAULT_DUPLICATE_COVERAGE;
    const coverage = input.coverage ?? (() => 0);
    const items = [];
    const contents = input.contents ?? {};
    const push = (item) => {
        const destructive = item.destructive ?? DESTRUCTIVE_ACTIONS.includes(item.action);
        const action = item.confidence < floor && item.action !== 'REQUIRES_REVIEW' ? 'REQUIRES_REVIEW' : item.action;
        items.push({ ...item, action, destructive: DESTRUCTIVE_ACTIONS.includes(action) });
    };
    for (const artifact of input.artifacts) {
        const text = contents[artifact.path] ?? '';
        // Obsolescence: a document that declares itself superseded is history, and
        // history is kept in a software project — but it must not read as current.
        if (artifact.obsolete) {
            push({
                path: artifact.path,
                action: 'DEPRECATE',
                dimension: 'obsolescence',
                reason: `declares status "${artifact.status}"; it is history, not current guidance`,
                confidence: 0.9,
                evidence: [`status: ${artifact.status}`, ...artifact.reasons],
            });
        }
        // Version drift, declared state only. Front matter is where this project
        // states current fact (`plugin_version`), so a disagreement there is precise.
        //
        // A free-text scan for version-shaped strings was tried and removed: on a
        // healthy repository it flagged ten documents, because changelogs, migration
        // records and batch plans legitimately quote historical versions. Detecting
        // stale *prose* is therefore declared **not implemented** rather than shipped
        // as a noisy heuristic (Batch 6: capability boundaries over assumed ones).
        if (input.truth.packageVersion !== undefined) {
            const declared = artifact.frontMatter.plugin_version;
            if (declared !== undefined && declared !== input.truth.packageVersion) {
                push({
                    path: artifact.path,
                    action: 'UPDATE',
                    dimension: 'relevance',
                    reason: `front matter declares plugin_version ${declared}; the package is ${input.truth.packageVersion}`,
                    confidence: 0.95,
                    evidence: [`plugin_version: ${declared}`, `package.json: ${input.truth.packageVersion}`],
                });
            }
        }
        // Duplication: same functional role *and* overlapping subject matter. A lexical
        // match alone is not enough (Batch 6 §4) — same role is what makes it a merge.
        for (const other of input.artifacts) {
            if (other.path <= artifact.path)
                continue;
            if (other.role !== artifact.role)
                continue;
            if (other.inventory !== artifact.inventory)
                continue;
            if (artifact.inventory === 'generated-artifact' || artifact.inventory === 'temporary-artifact')
                continue;
            const score = coverage(artifact.tokens, other.tokens);
            if (score < duplicateFloor)
                continue;
            push({
                path: other.path,
                action: 'MERGE',
                dimension: 'duplication',
                reason: `same role (${other.role}) and ${Math.round(score * 100)}% subject overlap with ${artifact.path}; extend one instead of keeping both`,
                confidence: score,
                evidence: [`role: ${other.role}`, `overlap: ${score.toFixed(2)}`, `peer: ${artifact.path}`],
            });
        }
    }
    // Healthy artifacts get an explicit verdict, so a report never leaves a scanned
    // path unaccounted for.
    const decided = new Set(items.map((item) => item.path));
    for (const artifact of input.artifacts) {
        if (decided.has(artifact.path))
            continue;
        push({
            path: artifact.path,
            action: artifact.inventory === 'historical-artifact' ? 'KEEP' : 'LEAVE_UNCHANGED',
            dimension: 'purpose',
            reason: `no deterministic finding; ${artifact.authority} artifact, ${artifact.reasons.join('; ')}`,
            confidence: 1,
            evidence: [artifact.reasons[0] ?? 'no signal'],
        });
    }
    return items.sort((a, b) => (a.path === b.path ? a.action.localeCompare(b.action) : a.path.localeCompare(b.path)));
}
/**
 * Reconcile one meaningful change against the rest of the environment.
 *
 * Batch 6 §5. This is a *report*, and the batch is explicit that perfect automatic
 * synchronization must not be claimed: it names the artifacts that mention the
 * change's subject, separates the ones whose stated facts have gone stale, and
 * lists what it could not settle.
 */
export function reconcileChange(input) {
    const coverage = input.coverage ?? (() => 0);
    const floor = input.affectedFloor ?? 0.3;
    const affected = [];
    for (const artifact of input.artifacts) {
        if (artifact.path === input.change.path)
            continue;
        if (coverage(input.change.tokens, artifact.tokens) < floor)
            continue;
        affected.push(artifact.path);
    }
    const items = planMaintenance({
        artifacts: input.artifacts.filter((a) => affected.includes(a.path) || a.path === input.change.path),
        truth: input.truth,
        contents: input.contents,
        coverage,
    });
    const stale = items.filter((item) => item.action === 'UPDATE');
    const contradictions = items.filter((item) => item.dimension === 'contradiction' || item.action === 'REQUIRES_REVIEW');
    const unresolved = [];
    if (affected.length === 0) {
        unresolved.push(`no other artifact mentions the subject of ${input.change.path}; consistency rests on the change alone`);
    }
    for (const item of contradictions)
        unresolved.push(`${item.path}: ${item.reason}`);
    return { changed: input.change.path, affected, stale, contradictions, unresolved };
}
/* ── the round ──────────────────────────────────────────────────────────────── */
/** Assemble a complete report from already-read artifacts. Pure; no I/O. */
export function runMaintenanceRound(input) {
    const items = planMaintenance({
        artifacts: input.artifacts,
        truth: input.truth,
        contents: input.contents,
        coverage: input.coverage,
    });
    const counts = {};
    const inventoryCounts = {};
    for (const action of MAINTENANCE_ACTIONS)
        counts[action] = 0;
    for (const artifact of input.artifacts) {
        inventoryCounts[artifact.inventory] = (inventoryCounts[artifact.inventory] ?? 0) + 1;
    }
    for (const item of items)
        counts[item.action] = (counts[item.action] ?? 0) + 1;
    const unresolved = items
        .filter((item) => item.action === 'REQUIRES_REVIEW' || (item.destructive && item.confidence < 0.8))
        .map((item) => `${item.path}: ${item.reason}`);
    if (input.truncated === true)
        unresolved.push('the scan hit its document bound; the inventory is incomplete');
    for (const path of input.skipped ?? [])
        unresolved.push(`${path}: unreadable, not inventoried`);
    return {
        artifacts: [...input.artifacts],
        items,
        counts,
        inventoryCounts,
        unresolved,
        scanned: input.scanned ?? input.artifacts.length,
        truncated: input.truncated === true,
    };
}
/** Render a report as the compact text a model or operator reads. */
export function formatMaintenanceReport(report) {
    const lines = [];
    lines.push(`maintenance round: scanned ${report.scanned} artifact(s)${report.truncated ? ' (truncated)' : ''}`);
    const inventory = Object.entries(report.inventoryCounts).sort();
    if (inventory.length > 0)
        lines.push(`inventory: ${inventory.map(([k, v]) => `${k}=${v}`).join(' ')}`);
    lines.push('actions (proposals only; nothing was changed):');
    for (const item of report.items) {
        lines.push(`  ${item.action} ${item.path} — ${item.reason} (confidence ${item.confidence.toFixed(2)})`);
    }
    for (const action of MAINTENANCE_ACTIONS) {
        if ((report.counts[action] ?? 0) > 0)
            lines.push(`count ${action}=${report.counts[action]}`);
    }
    lines.push(`unresolved: ${report.unresolved.length}`);
    for (const issue of report.unresolved)
        lines.push(`  - ${issue}`);
    return lines.join('\n');
}
/** The kernel's export shape, mirroring the other modules (Part B §24). */
export const maintenanceKernel = Object.freeze({
    name: 'maintenance',
    version: '0.1.0',
    inventoryClasses: INVENTORY_CLASSES,
    diagnosisDimensions: DIAGNOSIS_DIMENSIONS,
    actions: MAINTENANCE_ACTIONS,
    destructiveActions: DESTRUCTIVE_ACTIONS,
});
