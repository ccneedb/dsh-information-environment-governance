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
import { createDurableStore, sessionIdOf } from '../kernel/durability.js';
/** Build the durable-state operations. */
export function createDurableState(input) {
    // Storage is optional and every failure degrades to "no persistence"; IEG's
    // enforcement never depends on it. The fallback also covers a storage seam that
    // throws during construction, rather than only one that reports an error.
    let durable = {
        available: async () => false,
        load: async () => undefined,
        save: async () => false,
        close: async () => { },
    };
    input.guarded('storageDomain', () => {
        durable = createDurableStore(input.ctx, {
            onError: (error) => input.note('ieg.capability_missing', { capability: 'storageDomain' }, `ieg: governance persistence unavailable: ${String((error?.message) ?? error)}`, 'warn'),
        });
    });
    /** Sessions already looked up, so a resumed session costs one read, not one per call. */
    const hydratedSessions = new Set();
    /**
     * Restore one agent's orientation from durable state. Called lazily, before
     * the orientation requirement is evaluated, so a resumed session is not asked
     * to re-orient work that was already oriented (Gate F).
     *
     * @param agent
     * @returns whether a usable snapshot was restored.
     */
    const hydrateOrientation = async (agent) => {
        const { orientation } = input.governance.forAgent(agent);
        if (orientation.isRecorded())
            return true;
        const sessionId = sessionIdOf(agent);
        if (sessionId === '' || hydratedSessions.has(sessionId))
            return false;
        hydratedSessions.add(sessionId);
        const snapshot = await durable.load(sessionId);
        if (snapshot === undefined)
            return false;
        if (!orientation.hydrate(snapshot))
            return false;
        input.note('ieg.orientation_restored', { sessionId }, 'ieg: orientation_restored');
        return true;
    };
    const persistOrientation = async (snapshot, exec) => {
        const agent = (exec ?? {}).agent;
        await durable.save(sessionIdOf(agent), snapshot);
    };
    input.guarded('dispose.storageDomain', () => {
        input.ctx.effect?.(() => () => {
            void durable.close();
        }, 'ieg: release the governance domain handle');
    });
    return { hydrateOrientation, persistOrientation };
}
