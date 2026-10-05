/**
 * IEG host layer — the maintenance round's tool registration (R8-05).
 *
 * R8-05 asks the entry point to become composition and wiring. This block was bound to
 * the live agent's state through a closure, so extracting it means naming that dependency
 * instead of capturing it: `surface` carries exactly what the tool needs, and nothing in
 * here reaches into the composition.
 */
import { MAINTENANCE_TOOL_NAME, renderJson, } from './tool-surface.js';
import { classifyArtifact, formatMaintenanceReport, formatReconciliation, maintenanceKernel, reconcileChange, runMaintenanceRound, } from '../kernel/maintenance.js';
import { DEFAULT_TREE_DEPTH, headingsOf, jaccard, scanDocumentTree, tokensOf } from '../kernel/overlap.js';
/** The agent a tool execution belongs to. */
function agentOf(exec) {
    return (exec ?? {}).agent;
}
/** Register the maintenance round's tool. */
export function registerMaintenanceTool(surface) {
    surface.guarded('tools.maintain_environment', () => {
        surface.tools?.register({
            name: MAINTENANCE_TOOL_NAME,
            description: 'Run one information environment maintenance round over the workspace: inventory persistent artifacts, diagnose duplication, staleness, obsolescence and contradiction, and return proposed actions (KEEP, MERGE, UPDATE, REPLACE, DEPRECATE, REMOVE, LEAVE_UNCHANGED, REQUIRES_REVIEW) each with a reason and a confidence. Read-only: it changes nothing, and every destructive proposal needs an explicit human decision. Use it when the runtime context marks maintenance as due, or when asked to check the information environment.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Root to inventory, relative to the workspace. Defaults to ".".' },
                    depth: { type: 'number', description: `Directory depth to scan (default ${DEFAULT_TREE_DEPTH}, hard cap 6).` },
                    changed: {
                        type: 'string',
                        description: 'Optional path of an artifact that just changed. Naming one adds a reconciliation: which other artifacts mention its subject, which of their stated facts have gone stale, and what remains unresolved.',
                    },
                },
            },
            output: { schema: { type: 'object' }, render: renderJson },
            execute: async (args, exec) => {
                const fsService = surface.fs();
                const raw = (args ?? {});
                const root = typeof raw.path === 'string' && raw.path.trim() !== '' ? raw.path : '.';
                const depth = Math.min(typeof raw.depth === 'number' && Number.isFinite(raw.depth) ? Math.max(0, Math.trunc(raw.depth)) : DEFAULT_TREE_DEPTH, 6);
                if (fsService === undefined) {
                    // An unavailable service is a recorded degradation, never a silent
                    // "nothing to maintain".
                    surface.note('ieg.maintenance_round', { status: 'degraded', reason: 'no filesystem service' }, 'maintenance round degraded: no filesystem service', 'warn');
                    return {
                        status: 'degraded',
                        reason: 'the filesystem service is unavailable, so no artifact could be read',
                        unscanned: true,
                    };
                }
                const scanned = await scanDocumentTree(fsService, root, { maxDepth: depth });
                const contents = {};
                const artifacts = scanned.documents.map((document) => {
                    contents[document.path] = document.content;
                    return classifyArtifact({
                        path: document.path,
                        content: document.content,
                        headings: headingsOf(document.content),
                        tokens: [...tokensOf(document.content)],
                    });
                });
                const report = runMaintenanceRound({
                    artifacts,
                    truth: { packageVersion: surface.versions.plugin, promptVersion: surface.versions.prompt },
                    contents,
                    coverage: (a, b) => jaccard(new Set(a), new Set(b)),
                    scanned: scanned.documents.length,
                    truncated: scanned.truncated,
                    skipped: scanned.skipped,
                });
                // Instruction 5: reconcile one named change against the rest of the
                // environment. This is the only caller of `reconcileChange`, so the
                // capability has a real path rather than being dead code.
                const changed = typeof raw.changed === 'string' && raw.changed.trim() !== '' ? raw.changed.trim() : undefined;
                let reconciliation;
                if (changed !== undefined) {
                    const subject = artifacts.find((artifact) => artifact.path === changed);
                    reconciliation = subject === undefined
                        ? { changed, affected: [], stale: [], contradictions: [], unresolved: [`${changed} is not in the scanned inventory, so nothing could be reconciled`] }
                        : (() => {
                            const result = reconcileChange({
                                change: { path: subject.path, summary: subject.headings[0] ?? subject.path, tokens: subject.tokens },
                                artifacts,
                                contents,
                                truth: { packageVersion: surface.versions.plugin, promptVersion: surface.versions.prompt },
                                coverage: (a, b) => jaccard(new Set(a), new Set(b)),
                            });
                            return { ...result, report: formatReconciliation(result) };
                        })();
                    surface.note('ieg.maintenance_round', {
                        phase: 'reconciliation',
                        changed,
                        affected: reconciliation.affected?.length ?? 0,
                        unresolved: reconciliation.unresolved?.length ?? 0,
                    });
                }
                // A completed round is what resets the seven-batch counter (Batch 6 §6),
                // and the reset is recorded so the accounting is auditable.
                const counter = surface.counterFor(agentOf(exec));
                const countedBefore = counter.count;
                surface.completeRound(agentOf(exec));
                surface.note('ieg.maintenance_round', {
                    status: 'ok',
                    root,
                    // R8-10 §6: report what the scan actually covered, so a reader cannot mistake a
                    // bounded or partially read scan for an exhaustive one.
                    coverage: scanned.coverage,
                    scanned: report.scanned,
                    proposals: report.items.length,
                    unresolved: report.unresolved.length,
                    batchesResetFrom: countedBefore,
                    roundsCompleted: counter.roundsCompleted,
                });
                return {
                    status: 'ok',
                    root,
                    ...(reconciliation === undefined ? {} : { reconciliation }),
                    scanned: report.scanned,
                    truncated: report.truncated,
                    inventory: report.inventoryCounts,
                    counts: report.counts,
                    items: report.items,
                    unresolved: report.unresolved,
                    actions: maintenanceKernel.actions,
                    report: formatMaintenanceReport(report),
                };
            },
        });
    });
}
