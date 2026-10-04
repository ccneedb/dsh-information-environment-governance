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
export declare const INVENTORY_CLASSES: readonly string[];
/** What the diagnosis looks at. Shape mirrors Batch 6 §2 "Diagnosis". */
export declare const DIAGNOSIS_DIMENSIONS: readonly string[];
/** The explicit maintenance vocabulary of Batch 6 §2 — no free-form actions. */
export declare const MAINTENANCE_ACTIONS: readonly string[];
/**
 * The actions that can destroy or rewrite information.
 *
 * A round never applies these itself; it reports them. They are also the actions a
 * caller must not treat as routine when reading a report.
 */
export declare const DESTRUCTIVE_ACTIONS: readonly string[];
/**
 * Direct user instruction batches after which maintenance is marked required
 * (Batch 6 §6). Seven, and counted in `src/kernel/state.ts`.
 */
export declare const MAINTENANCE_BATCH_THRESHOLD = 7;
/** Below this confidence, a proposed action becomes `REQUIRES_REVIEW`. */
export declare const DEFAULT_REVIEW_FLOOR = 0.6;
/** Subject coverage at or above which two same-class artifacts are duplicates. */
export declare const DEFAULT_DUPLICATE_COVERAGE = 0.6;
/** The authoritative current facts a document's statements are checked against. */
export interface MaintenanceTruth {
    /** `package.json` `version`. */
    packageVersion?: string;
    /** The runtime `PROMPT_VERSION`. */
    promptVersion?: string;
    /** The single declared host baseline, e.g. `0.2.1-alpha.1`. */
    baseline?: string;
}
/** One inventoried artifact, with the deterministic part of its diagnosis. */
export interface ArtifactFacts {
    path: string;
    bytes: number;
    inventory: string;
    /** What the artifact is *for*, from its path and declared front matter. */
    role: string;
    /** Declared `status`, when the artifact carries front matter. */
    status: string;
    authority: 'authoritative' | 'supporting' | 'historical' | 'unknown';
    /** The artifact's front matter, flattened to strings. */
    frontMatter: Record<string, string>;
    headings: string[];
    tokens: string[];
    /** True when the artifact declares itself superseded, deprecated or retired. */
    obsolete: boolean;
    /** Why this classification was reached, one line per signal. */
    reasons: string[];
}
/** One proposed or settled action. */
export interface MaintenanceItem {
    path: string;
    action: string;
    dimension: string;
    reason: string;
    /** 0–1: how strongly the evidence supports the action. */
    confidence: number;
    evidence: string[];
    destructive: boolean;
}
/** The complete, serializable result of one diagnosis-and-planning pass. */
export interface MaintenanceReport {
    artifacts: ArtifactFacts[];
    items: MaintenanceItem[];
    counts: Record<string, number>;
    inventoryCounts: Record<string, number>;
    /** Things the round could not settle and will not act on. */
    unresolved: string[];
    scanned: number;
    truncated: boolean;
}
/** Front matter is the project's own convention: a leading `---` block. */
export declare function parseFrontMatter(text: string): Record<string, string>;
/** Signal-weighted inventory classification. Path first, then declared status. */
export declare function classifyInventory(path: string, frontMatter: Record<string, string>): {
    inventory: string;
    reasons: string[];
};
/** The declared authority of an artifact, from its front matter and inventory class. */
export declare function authorityOf(inventory: string, frontMatter: Record<string, string>): ArtifactFacts['authority'];
/**
 * Classify and diagnose one artifact deterministically.
 *
 * `role` is the artifact's *functional* role, not its filename: it comes from the
 * declared `doc_type` when present, else from the inventory class. Batch 6 §4 asks
 * a creation to be judged on functional role, so the role has to be a first-class
 * value rather than something re-derived from a title at comparison time.
 */
export declare function classifyArtifact(input: {
    path: string;
    content: string;
    headings: string[];
    tokens: string[];
    bytes?: number;
}): ArtifactFacts;
/**
 * Plan maintenance for the inventoried artifacts.
 *
 * Deterministic findings only — duplication by subject coverage, version-figure
 * drift against {@link MaintenanceTruth}, and declared obsolescence. Everything a
 * confident judgement would need but the evidence does not support becomes
 * `REQUIRES_REVIEW`, and every destructive action is flagged rather than applied.
 */
export declare function planMaintenance(input: {
    artifacts: readonly ArtifactFacts[];
    truth: MaintenanceTruth;
    /** Raw text by path, needed for version-figure drift. */
    contents?: Record<string, string>;
    duplicateCoverage?: number;
    reviewFloor?: number;
    /** Subject-coverage function, injected so this module stays pure. */
    coverage?: (a: readonly string[], b: readonly string[]) => number;
}): MaintenanceItem[];
/** What a change to project information affects, and what it leaves unsettled. */
export interface ReconciliationResult {
    changed: string;
    affected: string[];
    stale: MaintenanceItem[];
    contradictions: MaintenanceItem[];
    unresolved: string[];
}
/**
 * Reconcile one meaningful change against the rest of the environment.
 *
 * Batch 6 §5. This is a *report*, and the batch is explicit that perfect automatic
 * synchronization must not be claimed: it names the artifacts that mention the
 * change's subject, separates the ones whose stated facts have gone stale, and
 * lists what it could not settle.
 */
export declare function reconcileChange(input: {
    change: {
        path: string;
        summary: string;
        tokens: readonly string[];
    };
    artifacts: readonly ArtifactFacts[];
    truth: MaintenanceTruth;
    contents?: Record<string, string>;
    coverage?: (a: readonly string[], b: readonly string[]) => number;
    affectedFloor?: number;
}): ReconciliationResult;
/** Assemble a complete report from already-read artifacts. Pure; no I/O. */
export declare function runMaintenanceRound(input: {
    artifacts: readonly ArtifactFacts[];
    truth: MaintenanceTruth;
    contents?: Record<string, string>;
    coverage?: (a: readonly string[], b: readonly string[]) => number;
    scanned?: number;
    truncated?: boolean;
    skipped?: readonly string[];
}): MaintenanceReport;
/** Render a report as the compact text a model or operator reads. */
export declare function formatMaintenanceReport(report: MaintenanceReport): string;
/** Render a reconciliation result as the compact text a model or operator reads. */
export declare function formatReconciliation(result: ReconciliationResult): string;
/** The kernel's export shape, mirroring the other modules (Part B §24). */
export declare const maintenanceKernel: Readonly<{
    name: "maintenance";
    version: "0.1.0";
    inventoryClasses: readonly string[];
    diagnosisDimensions: readonly string[];
    actions: readonly string[];
    destructiveActions: readonly string[];
}>;
