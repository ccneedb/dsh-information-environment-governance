/**
 * IEG host layer — durable governance state (R8-05).
 *
 * The "durable state" section of the entry point: an optional storage domain that restores
 * a resumed session's orientation and persists a new one, degrading to "no persistence" —
 * never to "no enforcement" — when storage is absent or fails.
 *
 * Extracted as a factory because the section owns state: the store handle it may or may not
 * obtain, and the set of sessions already looked up so a resumed session costs one read
 * rather than one per call.
 */

import type { GovernanceState } from '../kernel/state.js'
import { createDurableStore, sessionIdOf } from '../kernel/durability.js'

/** What durable state needs from the composition. */
export interface DurableStateInput {
  /** The host context, for the storage seam and disposal. */
  ctx: IegContext
  /** Record one diagnostic. */
  note: (code: string, data?: Record<string, unknown>, narration?: string, level?: 'info' | 'warn') => void
  /** Mount one capability, recording a degradation instead of failing the mount. */
  guarded: (capability: string, attach: () => void) => void
  /** Live per-agent governance state. */
  governance: GovernanceState
}

/** The durable-state operations the composition uses. */
export interface DurableState {
  /** Restore one agent's orientation; resolves whether a usable snapshot was restored. */
  hydrateOrientation: (agent: unknown) => Promise<boolean>
  /** Persist an orientation snapshot for the agent behind an execution. */
  persistOrientation: (snapshot: Record<string, unknown>, exec: unknown) => Promise<void>
}

/** Build the durable-state operations. */
export function createDurableState(input: DurableStateInput): DurableState {
  // Storage is optional and every failure degrades to "no persistence"; IEG's
  // enforcement never depends on it. The fallback also covers a storage seam that
  // throws during construction, rather than only one that reports an error.
  let durable: ReturnType<typeof createDurableStore> = {
    available: async () => false,
    load: async () => undefined,
    save: async () => false,
    close: async () => {},
  }
  input.guarded('storageDomain', () => {
    durable = createDurableStore(input.ctx, {
      onError: (error) =>
        input.note(
          'ieg.capability_missing',
          { capability: 'storageDomain' },
          `ieg: governance persistence unavailable: ${String(((error as { message?: unknown } | null)?.message) ?? error)}`,
          'warn',
        ),
    })
  })
  /** Sessions already looked up, so a resumed session costs one read, not one per call. */
  const hydratedSessions = new Set<string>()

  /**
   * Restore one agent's orientation from durable state. Called lazily, before
   * the orientation requirement is evaluated, so a resumed session is not asked
   * to re-orient work that was already oriented (Gate F).
   *
   * @param agent
   * @returns whether a usable snapshot was restored.
   */
  const hydrateOrientation = async (agent: unknown): Promise<boolean> => {
    const { orientation } = input.governance.forAgent(agent)
    if (orientation.isRecorded()) return true
    const sessionId = sessionIdOf(agent)
    if (sessionId === '' || hydratedSessions.has(sessionId)) return false
    hydratedSessions.add(sessionId)
    const snapshot = await durable.load(sessionId)
    if (snapshot === undefined) return false
    if (!orientation.hydrate(snapshot)) return false
    input.note('ieg.orientation_restored', { sessionId }, 'ieg: orientation_restored')
    return true
  }

  const persistOrientation = async (snapshot: Record<string, unknown>, exec: unknown): Promise<void> => {
    const agent = ((exec ?? {}) as { agent?: unknown }).agent
    await durable.save(sessionIdOf(agent), snapshot)
  }

  input.guarded('dispose.storageDomain', () => {
    input.ctx.effect?.(() => () => {
      void durable.close()
    }, 'ieg: release the governance domain handle')
  })
  return { hydrateOrientation, persistOrientation }
}
