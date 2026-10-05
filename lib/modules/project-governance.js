/**
 * Module: `project-governance` (M1, delivered first because it establishes the
 * common project-state vocabulary).
 *
 * **Problem:** the agent advances without a sufficiently stable project model.
 * **Objective:** maintain semantic alignment across the task lifetime.
 *
 * State is a compact, structured record — never a transcript copy. The whole
 * value is replaced on every transition, matching the host rule that a
 * state-carrying log event carries the complete post-change state.
 *
 * Boundary: DSH plan mode remains the host's planning mechanism. This module
 * governs project orientation and continuity, not a replacement plan workflow.
 *
 * Orientation semantics (Batch 1, 0.7.0). The recorded orientation is what the
 * agent has **declared**: intent, objective, scope, terminology, constraints,
 * assumptions, unknowns and phase. A declaration is not evidence of behavioural
 * consistency, and the two are deliberately separate concepts. A future
 * "Orientation Consistency" direction is therefore named but NOT implemented:
 *
 *   declared constraints -> observed actions -> consistency / drift evaluation
 *
 * Nothing here evaluates observed actions, and the gate must never be described
 * as if it did.
 */
// The only import in this module: the glossary kernel (Batch 7 Phase 7). It is
// dependency-free — no Node builtins, no host packages — so it cannot affect where
// this module mounts, and reusing it is what keeps terminology on the existing
// project ontology instead of becoming a second state system.
import { confirmTerm, createGlossary, deprecateTerm, upsertTerm } from '../kernel/glossary.js';
/** The orientation fields required before major execution (PR-01). */
export const REQUIRED_ORIENTATION_FIELDS = Object.freeze(['intent', 'objective', 'scope']);
export function createProjectState() {
    return {
        intent: '',
        objective: '',
        scope: '',
        glossary: createGlossary(),
        terminology: {},
        constraints: [],
        assumptions: [],
        unknowns: [],
        // The ordered task flow. An IEG extension to the §5.3 state groups, required
        // by acceptance objective OBJ-1 ("plan the global task flow").
        plan: [],
        currentPhase: 'orientation',
    };
}
/**
 * Apply one project-state event, returning a **new** state. The input is never
 * mutated.
 */
export function applyProjectEvent(state, event) {
    const next = {
        ...state,
        terminology: { ...state.terminology },
        glossary: { entries: [...state.glossary.entries] },
    };
    /** Keep the derived projection in step with the authoritative glossary. */
    const project = () => {
        next.terminology = Object.fromEntries(next.glossary.entries.map((entry) => [entry.canonicalTerm, entry.definition]));
    };
    switch (event.type) {
        case 'set-intent':
            next.intent = event.value ?? '';
            break;
        case 'set-objective':
            next.objective = event.value ?? '';
            break;
        case 'set-scope':
            next.scope = event.value ?? '';
            break;
        case 'set-phase':
            next.currentPhase = event.value ?? state.currentPhase;
            break;
        case 'define-term':
            if (event.term !== undefined)
                next.terminology[event.term] = event.definition ?? '';
            break;
        case 'glossary-define':
            // An orientation-captured term is inferred: it enters as PROVISIONAL and can
            // never revise a confirmed entry (Batch 7 Phase 9).
            if (event.term !== undefined) {
                upsertTerm(next.glossary, {
                    canonicalTerm: event.term,
                    ...(event.definition === undefined ? {} : { definition: event.definition }),
                    source: event.source ?? 'agent-inferred',
                    ...(event.aliases === undefined ? {} : { aliases: event.aliases }),
                    ...(event.scope === undefined ? {} : { scope: event.scope }),
                    ...(event.confidence === undefined ? {} : { confidence: event.confidence }),
                    ...(event.supersedes === undefined ? {} : { supersedes: event.supersedes }),
                });
                project();
            }
            break;
        case 'glossary-confirm':
            if (event.term !== undefined) {
                confirmTerm(next.glossary, {
                    canonicalTerm: event.term,
                    ...(event.definition === undefined ? {} : { definition: event.definition }),
                    ...(event.aliases === undefined ? {} : { aliases: event.aliases }),
                    ...(event.scope === undefined ? {} : { scope: event.scope }),
                    ...(event.supersedes === undefined ? {} : { supersedes: event.supersedes }),
                });
                project();
            }
            break;
        case 'glossary-deprecate':
            if (event.term !== undefined) {
                deprecateTerm(next.glossary, event.term, event.value);
                project();
            }
            break;
        case 'add-constraint':
            next.constraints = [...state.constraints, event.value ?? ''];
            break;
        case 'add-assumption':
            next.assumptions = [...state.assumptions, event.value ?? ''];
            break;
        case 'add-unknown':
            next.unknowns = [...state.unknowns, event.value ?? ''];
            break;
        case 'add-plan-step':
            next.plan = [...state.plan, event.value ?? ''].filter((step) => step !== '');
            break;
        case 'resolve-unknown':
            next.unknowns = state.unknowns.filter((entry) => entry !== event.value);
            break;
        default:
            return state;
    }
    return next;
}
/**
 * Whether the project model is sufficiently established for major execution,
 * and which orientation fields are still missing.
 */
export function orientationStatus(state) {
    const fieldValues = {
        intent: state.intent,
        objective: state.objective,
        scope: state.scope,
    };
    const missing = REQUIRED_ORIENTATION_FIELDS.filter((field) => (fieldValues[field] ?? '').trim() === '');
    if (Object.keys(state.terminology).length === 0)
        missing.push('terminology');
    return { oriented: missing.length === 0, missing };
}
/**
 * Evaluate the pre-step orientation gate.
 *
 * Returns `null` when the caller should admit the step, or a rejection decision
 * when the configured gate forbids entering it. `off` and `warn` never block:
 * P6 (uncertainty is allowed to persist) and P8 (diagnose before acting) make a
 * hard block the exception, not the default.
 */
export function evaluateOrientationGate(state, gate) {
    const status = orientationStatus(state);
    if (gate === 'reject' && !status.oriented) {
        return { decision: { kind: 'reject' }, missing: status.missing };
    }
    return { decision: null, missing: status.missing };
}
/** The §6 module descriptor. */
export const projectGovernanceModule = Object.freeze({
    id: 'project-governance',
    version: '0.2.0',
    problem: 'the agent advances without a sufficiently stable project model',
    objective: 'maintain semantic alignment across the task lifetime',
    principles: Object.freeze([
        'Before your first change, state the project intent and scope as you understand them, and the terms you will use for its central concepts.',
        'Distinguish explicit user requirements from your own assumptions and from open unknowns.',
        "When intent is unstated, derive the best-supported reading from the project's own artifacts, state that reading, and proceed with the narrowest reversible work rather than stalling.",
        'Preserve established project terminology; do not silently redefine the task.',
        'Re-check scope when the project direction changes, and state the change explicitly.',
    ]),
    prompt: 'State the ordered task flow before you begin it, and revise it explicitly when it changes.',
    dependencies: Object.freeze([]),
    risk: 'low',
    enabledByDefault: true,
    addresses: Object.freeze(['FC-2.1']),
});
