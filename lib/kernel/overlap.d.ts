/**
 * IEG kernel — document-overlap detection.
 *
 * Acceptance objective OBJ-2 asks that, before creating a file, the agent
 * determine whether the new file "highly overlaps in functional positioning and
 * main content with existing files". Prompt guidance alone cannot make that
 * reliable, so this module supplies the deterministic check that the
 * `tools/pre-execute` gate can apply.
 *
 * Design constraints:
 *
 * - **Bounded.** It reads at most `MAX_DOCUMENTS` nearby documents, each capped
 *   at `MAX_BYTES`, and only document-like extensions.
 * - **Fail-open.** A heuristic governance check must never block work because a
 *   read failed. Every error path returns "no overlap".
 * - **Dependency-free.** No imports, including Node builtins; the plugin stays
 *   import-free so it mounts in any composition.
 */
/** How the overlap check behaves when it fires. */
export declare const OVERLAP_MODES: readonly string[];
/** Word-set Jaccard at or above this counts as substantially overlapping. */
export declare const DEFAULT_OVERLAP_THRESHOLD = 0.4;
/**
 * Fraction of a new document's filename subject that an existing document's
 * headings must already cover for it to count as a duplicate subject. Body
 * similarity alone misses a rewrite of an already-documented topic.
 */
export declare const DEFAULT_SUBJECT_THRESHOLD = 0.5;
/**
 * Split text into comparable tokens, Unicode-aware and deterministic (R8-10 §1).
 *
 * Space-delimited scripts keep the previous behaviour exactly: lowercase runs of four or
 * more letters/digits. Unspaced scripts are tokenised as **character bigrams**, because a
 * whole run would be one token that never matches another document — the standard
 * deterministic approach when no dictionary is available, and one that keeps the scan a
 * pure function with no model call.
 */
export declare function tokensOf(text: string): Set<string>;
/**
 * @param a
 * @param b
 * @returns Jaccard similarity, 0 when either side is empty.
 */
export declare function jaccard(a: Set<string>, b: Set<string>): number;
/**
 * The first Markdown H1, used as a cheap "same document, different file" signal.
 *
 * @param text
 * @returns the lower-cased H1, or `null` when there is none.
 */
export declare function firstHeading(text: string): string | null;
/**
 * Every Markdown heading in a document, at any level, lower-cased.
 *
 * @param text
 * @returns the headings.
 */
export declare function headingsOf(text: string): string[];
/**
 * The tokens a filename claims as its subject, e.g. `AUTHENTICATION.md` ->
 * `{ authentication }`.
 *
 * @param target
 * @returns the filename stem tokens.
 */
export declare function filenameStemTokens(target: string): Set<string>;
/**
 * How much of a proposed document's filename subject an existing document
 * already covers, via its own filename, H1, or any section heading.
 *
 * This catches the failure that body-similarity misses: a new document that
 * re-states a topic for which the existing document already has a section, in
 * entirely different words. Measured on the evaluation sandboxes, a duplicate
 * `AUTHENTICATION.md` scored only 0.14 body similarity against a `SPEC.md` that
 * already carried an `## Authentication` section.
 *
 * @param stemTokens
 * @param document
 * @returns fraction of `stemTokens` covered, 0 when there are none.
 */
export declare function subjectCoverage(stemTokens: Set<string>, document: {
    path: string;
    content: string;
}): number;
/**
 * Compare a proposed document against existing ones.
 *
 * Three independent signals count as an overlap:
 *
 * 1. `similarity` — body word-set Jaccard at or above the threshold.
 * 2. `same_title` — the proposed H1 equals an existing document's H1.
 * 3. `subject` — the proposed *filename* names a topic the existing document
 *    already has a heading (or filename) for, however differently it is worded.
 *
 * @param input
 * @returns the overlap verdict and its per-document basis.
 */
/**
 * Whether two documents' heading structure is disjoint (Batch 6 §4).
 *
 * "Materially distinct" means the *information* differs, not just the wording: two
 * documents with no shared heading token cover different ground. An empty heading
 * set is no evidence either way, so this returns false rather than guessing.
 *
 * It is defined here, over this module's own helpers, so `overlap.ts` keeps its
 * documented no-imports property; the role classifier is injected by the caller.
 */
export declare function headingsMateriallyDistinct(a: string, b: string): boolean;
export declare function detectOverlap(input: {
    /** proposed document body */
    content: string;
    /** documents to compare against */
    existing: readonly {
        path: string;
        content: string;
    }[];
    /** proposed document path, enabling the subject signal */
    path?: string;
    threshold?: number;
    subjectThreshold?: number;
    /**
     * The functional-role classifier (Batch 6 §4). Injected rather than imported so
     * this module stays dependency-free; omitting it keeps the original lexical
     * behaviour exactly as it was.
     */
    roleOf?: (path: string, content: string) => string;
    /** Whether two documents are materially distinct; see {@link headingsMateriallyDistinct}. */
    distinct?: (a: string, b: string) => boolean;
}): {
    overlapping: boolean;
    with: string | null;
    similarity: number;
    same_title: boolean;
    subject: boolean;
    details: {
        path: string;
        similarity: number;
        same_title: boolean;
        subject: boolean;
        role: string;
        same_role: boolean;
        materially_distinct: boolean;
    }[];
};
/**
 * Extract a full-document write from a tool call, if it is one.
 *
 * Only calls that supply a complete body are considered: a partial `edit` has no
 * meaningful content to compare, so it is skipped rather than guessed at.
 *
 * @param execution
 * @returns the proposed document, or `null` when the call is not a full write.
 */
export declare function extractDocumentWrite(execution: IegToolExecution): {
    path: string;
    content: string;
} | null;
/**
 * Read the document-like files in the directory containing the target.
 *
 * @param fs
 * @param targetPath
 * @param options
 * @returns the documents found, and whether the scan stopped early.
 */
export declare function scanNearbyDocuments(fs: IegFileSystemService, targetPath: string, options?: {
    maxDocuments?: number;
    maxBytes?: number;
}): Promise<{
    documents: {
        path: string;
        content: string;
    }[];
    truncated: boolean;
}>;
/**
 * The gate entry point: decide whether a proposed new document duplicates an
 * existing one.
 *
 * Only *creations* are checked. Overwriting a file the agent already inspected
 * is the normal, desirable path and must not be obstructed.
 *
 * @param input
 * @returns the gate decision, or `null` when there is no overlap.
 */
export declare function checkDocumentOverlap(input: {
    fs: IegFileSystemService | undefined;
    execution: IegToolExecution;
    mode: 'off' | 'ask' | 'deny';
    threshold?: number;
    /** Passed through to {@link detectOverlap}; see Batch 6 §4. */
    roleOf?: (path: string, content: string) => string;
    distinct?: (a: string, b: string) => boolean;
}): Promise<{
    kind: 'ask' | 'deny';
    reason: string;
} | null>;
/** Bounds for {@link scanDocumentTree}; conservative because the host pays for them. */
export declare const DEFAULT_TREE_DEPTH = 3;
export declare const DEFAULT_TREE_DOCUMENTS = 200;
export declare const DEFAULT_TREE_BYTES: number;
/**
 * Read the document-like files under a root, breadth-first and strictly bounded.
 *
 * The maintenance round needs an inventory of the workspace, not a filesystem
 * walker: depth, document count and per-file size are all capped, unreadable
 * entries are reported rather than thrown, and the result says when it stopped
 * early so a report can never imply it saw everything.
 *
 * @param fs the host filesystem service
 * @param root a path the service can resolve
 * @param options bounds; every default is deliberately small
 * @returns the documents found, plus the truncation and skip facts
 */
export declare function scanDocumentTree(fs: IegFileSystemService, root: string, options?: {
    maxDepth?: number;
    maxDocuments?: number;
    maxBytes?: number;
}): Promise<{
    documents: {
        path: string;
        content: string;
    }[];
    truncated: boolean;
    skipped: string[];
    /**
     * How much of the tree the scan actually saw (R8-10 §5).
     *
     * `complete` — every candidate within the bounds was read; `bounded` — the document
     * bound stopped it; `partial` — some entries could not be read. A governance decision
     * reads this rather than assuming the scan was exhaustive, so it cannot imply stronger
     * evidence than was obtained (R8-10 §6).
     */
    coverage: 'complete' | 'bounded' | 'partial';
}>;
