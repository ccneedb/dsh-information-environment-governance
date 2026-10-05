/**
 * IEG kernel — per-agent governance state.
 *
 * The `0.1.0` prototype held every ledger once per composition, so two
 * concurrent agents shared one orientation, and a second session could satisfy
 * the first session's gate. That is a correctness
 * defect, not a cosmetic one (ARCHITECTURE-SPEC Part B §25, delta D15).
 *
 * The verified host fact behind the fix is §17.7: the per-agent scope key **is
 * the agent object itself**, and every seam IEG binds already carries that
 * object — `AssembleContext.agent` (merge-extended by `@deepseek-ai/dsh-agent`),
 * the `agent/pre-step` payload, `tools/pre-execute`'s `exec.agent`, and the
 * `tools/result` and `fs/*` actor.
 *
 * IEG therefore keys its live state by that object identity. Identity keying
 * gives the same isolation as a scope-keyed store, releases state with the agent
 * instead of leaking it, and preserves the package's zero-first-party-import
 * property: `ScopedLayers` would require importing `@deepseek-ai/dsh-scope`
 * (§25.3, assumption B3).
 */

import { MAINTENANCE_BATCH_THRESHOLD } from './maintenance.js'
import { createLedger, type InformationLedger } from '../modules/information-integrity.js'
import { createOrientationStore } from './orientation.js'

/**
 * The live agent id, when the subject carries one.
 *
 * The host's `Agent` exposes `id`; seams may hand IEG a subject that does not
 * (a bare assembly context, for example), and a missing id must never throw.
 */
export function agentIdOf(agent: unknown): string {
  const id = (agent as { id?: unknown } | null | undefined)?.id
  return typeof id === 'string' ? id : ''
}

/**
 * Direct user instruction batches, counted for the maintenance trigger.
 *
 * Batch 6 §6 is specific about what counts: direct user instruction batches, and
 * deliberately *not* internal agent steps, tool calls or generated context.
 */
export interface BatchCounter {
  count: number
  /** The last `agent/pre-step` turn counted, so one turn counts once. */
  lastTurn: number
  /** Set when the threshold is reached; cleared by a completed round. */
  required: boolean
  roundsCompleted: number
}

/** A fresh counter: nothing counted, no round run. */
export function createBatchCounter(): BatchCounter {
  return { count: 0, lastTurn: -1, required: false, roundsCompleted: 0 }
}

/**
 * Count one direct user instruction batch from an `agent/pre-step` payload.
 *
 * The host opens a **turn** for each batch of user messages and reports the
 * messages it removed from the inbox for the step; every internal step inside that
 * turn repeats the same turn number with an empty inbox. Keying on the turn number
 * while requiring at least one message therefore counts exactly what §6 asks for
 * and cannot be inflated by steps, tool calls or generated context.
 *
 * @returns whether a batch was counted, and whether maintenance just became due
 */
export function countInstructionBatch(
  counter: BatchCounter,
  input: { turn: unknown, messages: unknown },
): { counted: boolean, due: boolean } {
  const turn = typeof input.turn === 'number' && Number.isFinite(input.turn) ? input.turn : undefined
  const messages = Array.isArray(input.messages) ? input.messages : undefined
  if (turn === undefined || messages === undefined || messages.length === 0) {
    return { counted: false, due: counter.required }
  }
  if (turn === counter.lastTurn) return { counted: false, due: counter.required }
  counter.lastTurn = turn
  counter.count += 1
  const wasRequired = counter.required
  if (counter.count >= MAINTENANCE_BATCH_THRESHOLD) counter.required = true
  return { counted: true, due: !wasRequired && counter.required }
}

/** Record a completed round: the counter resets, per Batch 6 §6 step 4. */
export function completeMaintenanceRound(counter: BatchCounter): void {
  counter.count = 0
  counter.required = false
  counter.roundsCompleted += 1
}

/** One agent's governance state. */
interface AgentState {
  orientation: ReturnType<typeof createOrientationStore>
  batches: BatchCounter
  /** The information ledger (R8-02): the runtime's working set over the canonical records. */
  information: InformationLedger
}

/**
 * One agent's governance state.
 */
export function createAgentState(): AgentState {
  return {
    orientation: createOrientationStore(),
    batches: createBatchCounter(),
    information: createLedger(),
  }
}

/** Live governance state, isolated per live agent. */
interface GovernanceState {
  forAgent: (agent: unknown) => AgentState
  unscoped: AgentState
}

/**
 * Live governance state, isolated per live agent.
 *
 * A seam may run without an agent — a global prompt assembly, for example.
 * Those calls share one unscoped bucket rather than creating unbounded state.
 */
export function createGovernanceState(): GovernanceState {
  const byAgent = new WeakMap<object, ReturnType<typeof createAgentState>>()
  const unscoped = createAgentState()

  /**
   * Resolve one agent's state, creating it on first use.
   */
  function forAgent(agent: unknown): ReturnType<typeof createAgentState> {
    if (agent === null || typeof agent !== 'object') return unscoped
    let state = byAgent.get(agent)
    if (state === undefined) {
      state = createAgentState()
      byAgent.set(agent, state)
    }
    return state
  }

  return { forAgent, unscoped }
}
