/**
 * Wiring test: mount IEG on a stub Cordis context and assert it binds to the
 * correct verified event names with the correct decision shapes.
 *
 * `agent/pre-step` is dispatched by the agent loop, which needs a full
 * session/LLM composition to exercise end to end. This test therefore verifies
 * the *wiring and decision logic* — the right event, the right handler arity,
 * the right return shape — and leaves live dispatch to the composition test and
 * the profile load test.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as ieg from '../../lib/index.js'

/**
 * A minimal stand-in for the Cordis context that records what IEG registers.
 *
 * @returns {{
 *   ctx: IegContext,
 *   listeners: Map<string, Array<(...args: any[]) => any>>,
 *   sections: any[],
 *   injections: Array<{ services: readonly string[], callback: (ctx: any) => void }>,
 *   guards: Array<(execution: any) => string | undefined>,
 *   logs: Array<{ level: string, message: string }>,
 *   effects: Array<{ action: () => (() => void) | void, label?: string }>,
 * }}
 */
function stubContext() {
  /** @type {Map<string, Array<(...args: any[]) => any>>} */
  const listeners = new Map()
  /** @type {any[]} */
  const sections = []
  /** @type {Array<{ services: readonly string[], callback: (ctx: any) => void }>} */
  const injections = []
  /** @type {Array<(execution: any) => string | undefined>} */
  const guards = []
  /** @type {Array<any>} */
  const tools = []
  /** @type {Array<{ level: string, message: string }>} */
  const logs = []
  /** @type {Array<{ action: () => (() => void) | void, label?: string }>} */
  const effects = []

  /** @param {string} level */
  const record = (level) => (/** @type {string} */ message) => {
    logs.push({ level, message })
  }

  const ctx = {
    logger: { info: record('info'), warn: record('warn'), error: record('error') },
    systemPrompt: {
      section: (/** @type {any} */ section) => {
        sections.push(section)
        return () => {}
      },
      getSectionOrder: () => 500,
    },
    on: (/** @type {string} */ name, /** @type {any} */ handler) => {
      const existing = listeners.get(name) ?? []
      listeners.set(name, [...existing, handler])
      return () => {}
    },
    get: () => undefined,
    inject: (/** @type {readonly string[]} */ services, /** @type {any} */ callback) => {
      injections.push({ services, callback })
    },
    effect: (/** @type {any} */ action, /** @type {string} */ label) => {
      effects.push({ action, label })
      return () => {}
    },
  }

  return {
    ctx,
    listeners,
    sections,
    injections,
    guards,
    tools,
    logs,
    effects,
    /** Simulate the tool registry becoming available. */
    mountTools: () => {
      for (const injection of injections) {
        if (injection.services.includes('tools')) {
          injection.callback({
            tools: {
              guard: (/** @type {any} */ guard) => guards.push(guard),
              register: (/** @type {any} */ definition) => {
                tools.push(definition)
                return () => {}
              },
            },
          })
        }
      }
    },
    /** Record orientation through the tool IEG registered, as an agent would. */
    recordOrientation: async () => {
      const tool = tools.find((candidate) => candidate.name === 'record_orientation')
      if (tool === undefined) throw new Error('IEG did not register the orientation tool')
      return tool.execute({ intent: 'i', objective: 'o', scope: 's', terminology: [{ term: 't', definition: 'd' }], plan: ['step'] })
    },
  }
}

test('IEG registers exactly one additive prompt section', () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})

  assert.equal(stub.sections.length, 1, 'exactly one section: the composition pattern depends on it')
  const section = stub.sections[0]
  assert.equal(section.name, ieg.SECTION_NAME)
  assert.equal(section.order, 8500)
  assert.equal(section.interpolate, false, 'governance text is literal')
  assert.equal(section.complete, undefined, 'complete would replace the host prompt')
  assert.equal(typeof section.text, 'function')
  assert.match(section.text({}), /Information Environment Governance \(IEG\)/)
})

test('IEG binds to the verified event names only', () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  assert.deepEqual(
    [...stub.listeners.keys()].sort(),
    ['agent/pre-step', 'system-prompt/assemble', 'tools/pre-execute'],
  )
  for (const handlers of stub.listeners.values()) assert.equal(handlers.length, 1)
})

test('IEG requests the tool registry through ctx.inject, not eagerly', () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, { workspace: { protectedPaths: ['/repo/secrets'] } })

  assert.deepEqual(
    stub.injections.map((injection) => injection.services.join(',')).sort(),
    ['tools'],
    'every optional service is requested through ctx.inject, never read eagerly',
  )
  assert.equal(stub.guards.length, 0, 'no guard before the registry exists')
  assert.equal(stub.tools.length, 0, 'no tool before the registry exists')

  stub.mountTools()
  assert.equal(stub.guards.length, 1, 'the guard attaches once the registry is available')
  assert.match(String(stub.guards[0]({ name: 'write', arguments: { file_path: '/repo/secrets/k' } })), /protected path/)
  assert.deepEqual(
    stub.tools.map((tool) => tool.name).sort(),
    ['confirm_information', 'confirm_terminology', 'ieg_status', 'maintain_environment', 'record_information', 'record_orientation'],
    'IEG registers exactly its own four tools: orientation capture, the gated terminology confirmation, the read-only status surface, and the read-only maintenance round',
  )
})

test('the orientation requirement refuses the first mutation until orientation is recorded', async () => {
  const stub = stubContext()
  // The requirement is opt-in (ARCHITECTURE-SPEC §34.2 Q1), so this case states
  // it rather than inheriting it from the default.
  ieg.apply(stub.ctx, { workspace: { policy: 'allow' }, preStep: { requireBeforeMutation: true } })
  stub.mountTools()

  const handler = stub.listeners.get('tools/pre-execute')[0]
  let proceeded = 0
  const next = async () => {
    proceeded += 1
    return { kind: 'allow' }
  }

  // A write is refused outright, even though the workspace policy is `allow`,
  // because orientation has not been declared.
  const refused = await handler({ name: 'write', arguments: { file_path: '/repo/x' } }, next)
  assert.equal(refused.kind, 'deny')
  assert.match(refused.reason, /record the project orientation/)
  assert.match(refused.reason, /record_orientation/)
  assert.equal(proceeded, 0)
  assert.ok(stub.logs.some((entry) => entry.message.includes('orientation_required')))

  // Read-only inspection is never blocked by the requirement.
  const read = await handler({ name: 'read', arguments: { file_path: '/repo/x' } }, next)
  assert.equal(read.kind, 'allow')
  assert.equal(proceeded, 1)

  // After recording, the same write proceeds to the policy.
  await stub.recordOrientation()
  const allowed = await handler({ name: 'write', arguments: { file_path: '/repo/x' } }, next)
  assert.equal(allowed.kind, 'allow')
  assert.equal(proceeded, 2)
})

test('the orientation requirement is off by default, so the first write is not denied', async () => {
  const stub = stubContext()
  // No `preStep` override: the non-intrusive default from ARCHITECTURE-SPEC
  // §34.2 Q1 applies, and a write proceeds straight to the workspace policy.
  ieg.apply(stub.ctx, { workspace: { policy: 'allow' } })
  stub.mountTools()

  const handler = stub.listeners.get('tools/pre-execute')[0]
  const decision = await handler({ name: 'write', arguments: { file_path: '/repo/x' } }, async () => ({ kind: 'allow' }))
  assert.equal(decision.kind, 'allow')
  assert.equal(
    stub.logs.some((entry) => entry.message.includes('orientation_required')),
    false,
    'the default must not impose the orientation requirement',
  )
})

test('a protected path is refused even when orientation is missing, and never asks', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, { workspace: { policy: 'ask', protectedPaths: ['/repo/secrets'] } })
  const decision = await stub.listeners.get('tools/pre-execute')[0](
    { name: 'write', arguments: { file_path: '/repo/secrets/k' } },
    async () => ({ kind: 'allow' }),
  )
  // Protected paths outrank the orientation requirement: never an `ask`, never
  // routed to the user for a decision the policy has already made.
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /protected path/)
})

test('the orientation tool rejects an incomplete declaration', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  stub.mountTools()
  const tool = stub.tools[0]

  await assert.rejects(() => tool.execute({ intent: 'i', objective: 'o' }), /"scope" is required/)
  await assert.rejects(() => tool.execute({ intent: '  ', objective: 'o', scope: 's' }), /"intent" is required/)
  await assert.rejects(
    () => tool.execute({ intent: 'i', objective: 'o', scope: 's', plan: 'not-an-array' }),
    /"plan" must be an array/,
  )

  const recorded = await tool.execute({
    intent: 'improve the widget service',
    objective: 'align docs with v2',
    scope: 'documentation only',
    terminology: [{ term: 'widget', definition: 'the core entity' }],
    plan: ['read the docs', 'reconcile contradictions'],
  })
  assert.equal(recorded.recorded, true)
  assert.equal(recorded.oriented, true)
  assert.deepEqual(recorded.plan, ['read the docs', 'reconcile contradictions'])
})

test('the pre-step gate admits by default and rejects only when configured to', async () => {
  // Default gate is `off`: an unoriented project still proceeds (P6).
  const off = stubContext()
  ieg.apply(off.ctx, {})
  let proceeded = 0
  const offDecision = await off.listeners.get('agent/pre-step')[0](
    { agent: {}, messages: [], turn: 1, step: 1 },
    async () => {
      proceeded += 1
      return { kind: 'enter', messages: [] }
    },
  )
  assert.equal(proceeded, 1, 'next() must be called when not rejecting')
  assert.equal(offDecision.kind, 'enter')

  // `reject` blocks the step: the turn ends with the durable reason `blocked`.
  const strict = stubContext()
  ieg.apply(strict.ctx, { preStep: { orientationGate: 'reject' } })
  let proceededStrict = 0
  const strictDecision = await strict.listeners.get('agent/pre-step')[0](
    { agent: {}, messages: [], turn: 1, step: 1 },
    async () => {
      proceededStrict += 1
      return { kind: 'enter', messages: [] }
    },
  )
  assert.deepEqual(strictDecision, { kind: 'reject' })
  assert.equal(proceededStrict, 0, 'next() must not be called when rejecting')
  assert.ok(strict.logs.some((entry) => entry.message.includes('pre_step_rejected')))
})

test('the pre-step handler has the waterfall arity the host dispatches', () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  const handler = stub.listeners.get('agent/pre-step')[0]
  // payload + next
  assert.equal(handler.length, 2)
  assert.equal(stub.listeners.get('tools/pre-execute')[0].length, 2)
})

test('the mutation gate lets inspection through and gates mutation', async () => {
  const stub = stubContext()
  // The orientation requirement is disabled here so this test isolates the
  // workspace policy; it has its own test above.
  ieg.apply(stub.ctx, { workspace: { policy: 'deny' }, preStep: { requireBeforeMutation: false } })
  const handler = stub.listeners.get('tools/pre-execute')[0]

  let readProceeded = 0
  const read = await handler({ name: 'read', arguments: { file_path: '/a' } }, async () => {
    readProceeded += 1
    return { kind: 'allow' }
  })
  assert.equal(readProceeded, 1)
  assert.equal(read.kind, 'allow')

  let writeProceeded = 0
  const write = await handler({ name: 'write', arguments: { file_path: '/a' } }, async () => {
    writeProceeded += 1
    return { kind: 'allow' }
  })
  assert.equal(writeProceeded, 0)
  assert.equal(write.kind, 'deny')
  assert.ok(stub.logs.some((entry) => entry.message.includes('workspace_mutation_blocked')))
})

test('the ask policy emits the host approval request rather than a denial', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, { workspace: { policy: 'ask' }, preStep: { requireBeforeMutation: false } })
  const decision = await stub.listeners.get('tools/pre-execute')[0](
    { name: 'write', arguments: { file_path: '/a' } },
    async () => ({ kind: 'allow' }),
  )
  assert.equal(decision.kind, 'ask')
  assert.ok(stub.logs.some((entry) => entry.message.includes('workspace_mutation_gated')))
})

test('the mount diagnostic is emitted with the modules and section placement', () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  const mount = stub.logs.find((entry) => entry.message.startsWith('ieg: governance mounted'))
  assert.ok(mount, 'the mount diagnostic is the load-verification signal')
  assert.match(mount.message, /modules=project-governance,information-integrity,workspace-governance/)
  assert.match(mount.message, /section=ieg:governance@8500/)
  assert.match(mount.message, /workspace=ask/)
})

test('a disabled plugin registers nothing and says so', () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, { enabled: false })
  assert.equal(stub.sections.length, 0)
  assert.equal(stub.listeners.size, 0)
  assert.ok(stub.logs.some((entry) => entry.message.includes('disabled by configuration')))
})

test('diagnostics can be silenced without changing enforcement', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, { diagnostics: false, workspace: { policy: 'deny' } })
  const decision = await stub.listeners.get('tools/pre-execute')[0](
    { name: 'write', arguments: { file_path: '/a' } },
    async () => ({ kind: 'allow' }),
  )
  assert.equal(decision.kind, 'deny', 'enforcement still applies')
  assert.equal(stub.logs.length, 0, 'nothing is logged')
})

/* ── §26.2: apply() must not throw ───────────────────────────────────────── */

test('an invalid configuration is reported read-only instead of unmounting silently', async () => {
  const stub = stubContext()
  // §26.2: the host reports a throwing entry as "N entry did not activate" and
  // carries on, so IEG must degrade to a diagnostic it can be seen through.
  assert.doesNotThrow(() => ieg.apply(stub.ctx, { nope: 1 }))

  // Fail-safe: no prompt section and no enforcement from an unvalidated config.
  assert.equal(stub.sections.length, 0, 'no section without a validated configuration')
  assert.equal(stub.listeners.size, 0, 'no enforcement from an unvalidated configuration')

  // Observable: the fault reaches the transcript through the read-only tool.
  stub.mountTools()
  const status = stub.tools.find((tool) => tool.name === ieg.STATUS_TOOL_NAME)
  assert.ok(status, 'the read-only status tool must be registered so the fault is visible')
  const report = await status.execute({}, {})
  assert.equal(report.mount.mounted, false)
  assert.match(report.mount.configError, /unknown key/)
  assert.equal(report.diagnostics[0].code, 'ieg.config_invalid')
  assert.ok(stub.logs.some((entry) => entry.message.includes('config_invalid')))
})

test('a failing capability degrades to a diagnostic and the rest of the plugin still binds', () => {
  const stub = stubContext()
  stub.ctx.systemPrompt.section = () => {
    throw new Error('duplicate section name')
  }
  assert.doesNotThrow(() => ieg.apply(stub.ctx, {}))

  // The failed seam is isolated: enforcement and the rest of the mount survive.
  assert.equal(stub.sections.length, 0)
  assert.deepEqual(
    [...stub.listeners.keys()].sort(),
    ['agent/pre-step', 'system-prompt/assemble', 'tools/pre-execute'],
  )
  assert.ok(
    stub.logs.some((entry) => entry.message.includes('systemPrompt.section failed')),
    'the failed capability must be attributed in the diagnostics narration',
  )
  assert.ok(
    stub.logs.some((entry) => entry.message.includes('governance mounted')),
    'a partial mount must still record that it mounted, as a partial mount',
  )
})

test('a broken logger cannot break the mount', () => {
  const stub = stubContext()
  stub.ctx.logger = {
    info() {
      throw new Error('logger down')
    },
    warn() {
      throw new Error('logger down')
    },
    error() {
      throw new Error('logger down')
    },
  }
  // Log narration is best effort (§28.3 channel D); the ring and the tools carry
  // the state regardless, so a deployment with no working exporter still mounts.
  assert.doesNotThrow(() => ieg.apply(stub.ctx, {}))
  assert.equal(stub.sections.length, 1)
  assert.equal(stub.listeners.size, 3)
})

test('a partial mount reports its degraded capabilities instead of claiming a clean mount', async () => {
  const stub = stubContext()
  stub.ctx.systemPrompt.section = () => {
    throw new Error('duplicate section name')
  }
  ieg.apply(stub.ctx, {})
  stub.mountTools()

  const status = stub.tools.find((tool) => tool.name === ieg.STATUS_TOOL_NAME)
  const report = await status.execute({}, {})
  // `mounted` says IEG is present; `degraded` says whether it is complete. A
  // health check that reads only `mounted` would miss a dropped enforcement seam.
  assert.equal(report.mount.mounted, true)
  assert.deepEqual(report.mount.degraded, ['systemPrompt.section'])
})

test('an absent seam is recorded as degraded rather than treated as unneeded', () => {
  const stub = stubContext()
  const fullCtx = stub.ctx
  // Remove the injection seam: without it there are no capture surfaces at all.
  delete /** @type {any} */ (fullCtx).inject
  assert.doesNotThrow(() => ieg.apply(fullCtx, {}))
  assert.equal(stub.injections.length, 0)
  assert.ok(
    stub.logs.some((entry) => entry.message.includes('capability_missing tools')),
    'the absent seam must be recorded, not silently skipped',
  )
})

test('a full mount degrades nothing and collects its disposer', () => {
  const stub = stubContext()
  assert.doesNotThrow(() => ieg.apply(stub.ctx, {}))
  stub.mountTools()
  // The durable handle is disposed through `ctx.effect`, and the disposer is the
  // registration's own contract: a future change that drops it must fail here.
  assert.equal(stub.effects.length, 1)
  assert.match(String(stub.effects[0].label), /release the governance domain handle/)
  const disposer = stub.effects[0].action()
  assert.equal(typeof disposer, 'function')
  assert.doesNotThrow(() => /** @type {() => void} */ (disposer)())
})

/* ── the operator's prompt file (Batch 5: no control plane, no lifecycle) ── */

/**
 * Run one case with the operator's prompt file pointed at a throwaway path. The
 * plugin resolves `$IEG_PROMPT_FILE` per `apply()`, so setting it here is exactly
 * how a real profile is pointed at its prompt text.
 *
 * @param {(prompt: { dir: string, file: string, write: (text: string) => void }) => Promise<void>} fn
 * @returns {Promise<void>}
 */
async function withPromptFile(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ieg-prompt-'))
  const file = path.join(dir, 'prompt.md')
  const previous = process.env.IEG_PROMPT_FILE
  process.env.IEG_PROMPT_FILE = file
  try {
    await fn({ dir, file, write: (text) => writeFileSync(file, text) })
  } finally {
    if (previous === undefined) delete process.env.IEG_PROMPT_FILE
    else process.env.IEG_PROMPT_FILE = previous
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the operator prompt.md applies at mount, is attributed, and is reported by ieg_status', async () => {
  await withPromptFile(async (prompt) => {
    prompt.write('# House rules\n\n- Never write outside the workspace.\n')
    const stub = stubContext()
    ieg.apply(stub.ctx, {})
    stub.mountTools()
    assert.equal(stub.sections[0].text({}), '# House rules\n\n- Never write outside the workspace.')

    const status = stub.tools.find((tool) => tool.name === ieg.STATUS_TOOL_NAME)
    const report = await status.execute({}, {})
    const escaped = ieg.PROMPT_VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(report.mount.promptVersion, new RegExp(`^${escaped}\\+user:`))
    assert.equal(report.prompt.source, 'prompt-file')
    assert.equal(report.prompt.file, prompt.file)

    const rendered = status.output.render({}, report)
    assert.ok(Array.isArray(rendered) && rendered.length > 0, 'ieg_status must render model-visible content')
    assert.ok(
      rendered.some((block) => block.type === 'text' && typeof block.text === 'string' && block.text.includes('mounted')),
      'ieg_status must render its mount record',
    )
  })
})

test('a refused prompt.md falls back to the compiled default with its reasons', async () => {
  await withPromptFile(async (prompt) => {
    prompt.write('Report {{objective}} each turn.')
    const stub = stubContext()
    ieg.apply(stub.ctx, {})
    assert.match(stub.sections[0].text({}), /Information Environment Governance \(IEG\)/)
    const rejection = stub.logs.find((entry) => entry.message.includes('prompt_override_rejected'))
    assert.ok(rejection, 'a refusal is a governance event, not a silent no-op')
    assert.match(rejection.message, /interpolation/)
  })
})

/* ── Batch 6: the maintenance round and the batch counter, as wired ─────────── */

/** A minimal read-only `ctx.fs` over a flat path→content map. */
function stubFs(files) {
  const key = (path) => path.replace(/^\.\/?/, '')
  return {
    resolve: async (path) => ({ targetKey: { path: key(path) } }),
    listDir: async (target) => {
      const base = target.targetKey.path === '' ? '' : `${target.targetKey.path}/`
      const names = new Set()
      for (const path of Object.keys(files)) {
        if (!path.startsWith(base)) continue
        names.add(path.slice(base.length).split('/')[0])
      }
      return [...names].map((name) => {
        const full = `${base}${name}`
        const isFile = Object.prototype.hasOwnProperty.call(files, full)
        return isFile
          ? { name, type: 'file', target: { targetKey: { path: full } }, size: files[full].length }
          : { name, type: 'directory', target: { targetKey: { path: full } } }
      })
    },
    readText: async (target) => files[target.targetKey.path],
  }
}

test('the maintenance tool reports a round, and is read-only by construction', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  stub.mountTools()
  stub.ctx.get = (name) => (name === 'fs' ? stubFs({
    'README.md': '---\ndoc_type: readme\nstatus: active\nowner: maintainers\n---\n\n# Readme\n\nproject usage\n',
    'history/OLD-SPEC.md': '---\nstatus: retired\n---\n\n# Old spec\n\nsuperseded guidance\n',
  }) : undefined)

  const tool = stub.tools.find((entry) => entry.name === 'maintain_environment')
  assert.ok(tool, 'the maintenance tool must be registered')
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['changed', 'depth', 'path'])

  const report = await tool.execute({ path: '.' }, {})
  assert.equal(report.status, 'ok')
  assert.equal(report.scanned, 2)
  const retired = report.items.find((item) => item.path === 'history/OLD-SPEC.md')
  assert.equal(retired.action, 'DEPRECATE')
  assert.equal(retired.destructive, true, 'a destructive proposal is flagged, never applied')
  assert.equal(typeof report.report, 'string')
  assert.match(report.report, /maintenance round: scanned 2 artifact/)
  assert.ok(Array.isArray(report.unresolved))
  // The round reports; it never registers a guard or writes anything.
  assert.equal(stub.guards.length, 1, 'only the mutation backstop guard exists')
})

test('the maintenance tool reconciles a named change instead of guessing', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  stub.mountTools()
  stub.ctx.get = (name) => (name === 'fs' ? stubFs({
    'PRODUCT-SPEC.md': '# Spec\n\ninformation environment governance scope and terms\n',
    'docs/guide.md': '# Guide\n\ninformation environment governance scope explained here\n',
    'docs/recipe.md': '# Recipe\n\nbaking bread with a long slow ferment\n',
  }) : undefined)

  const tool = stub.tools.find((entry) => entry.name === 'maintain_environment')
  const report = await tool.execute({ path: '.', changed: 'PRODUCT-SPEC.md' }, {})
  assert.equal(report.reconciliation.changed, 'PRODUCT-SPEC.md')
  assert.ok(report.reconciliation.affected.includes('docs/guide.md'))
  assert.ok(!report.reconciliation.affected.includes('docs/recipe.md'))
  assert.match(report.reconciliation.report, /reconciliation for PRODUCT-SPEC\.md/)

  const missing = await tool.execute({ path: '.', changed: 'not/in/scan.md' }, {})
  assert.match(missing.reconciliation.unresolved.join(' '), /not in the scanned inventory/)
})

test('the maintenance tool fails open but says so when no filesystem is available', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  stub.mountTools()
  // The stub's default `get` returns undefined: no filesystem service.
  const tool = stub.tools.find((entry) => entry.name === 'maintain_environment')
  const report = await tool.execute({}, {})
  assert.equal(report.status, 'degraded')
  assert.match(report.reason, /filesystem service is unavailable/)
  const note = stub.logs.find((entry) => entry.message.includes('maintenance round degraded'))
  assert.ok(note, 'a degradation is recorded, never a silent "nothing to maintain"')
})

test('the pre-step handler counts direct user instruction batches, not steps', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  const handler = stub.listeners.get('agent/pre-step')[0]
  const next = async () => ({ kind: 'admit' })

  // State is keyed by the agent *object identity* (ARCHITECTURE-SPEC §17.7), so the
  // same object must be reused — a fresh literal per call would reset the counter.
  const agent = { id: 'a1' }
  const call = (turn, messages) => handler({ agent, messages, turn, step: 0 }, next)
  for (let turn = 0; turn < 6; turn += 1) await call(turn, [{ role: 'user' }])
  // Internal steps inside an already-counted turn must not inflate the counter.
  await call(5, [])
  await call(5, [{ role: 'user' }])
  assert.ok(!stub.logs.some((entry) => entry.message.includes('maintenance_due')), 'six batches are not due')

  await call(6, [{ role: 'user' }])
  const due = stub.logs.filter((entry) => entry.message.includes('maintenance_due'))
  assert.ok(due.length >= 1, 'the seventh batch marks maintenance due')
  assert.match(due[0].message, /batches=7\/7/)
  assert.match(due[0].message, /next safe boundary/)

  // A further batch does not re-announce an already-required round.
  const announced = stub.logs.length
  await call(7, [{ role: 'user' }])
  const again = stub.logs.slice(announced).filter((entry) => entry.message.includes('maintenance_due'))
  assert.equal(again.length, 0, 'an already-required round is not re-announced on every batch')

  // A second agent starts from zero: one agent's batches never mark another's due.
  const other = { id: 'a2' }
  await handler({ agent: other, messages: [{ role: 'user' }], turn: 0, step: 0 }, next)
  const after = stub.logs.filter((entry) => entry.message.includes('maintenance_due'))
  assert.equal(after.length, due.length, 'another agent does not inherit a due round')
})

/* ── R8-01: the model cannot manufacture user confirmation ──────────────────── */

test('R8-01: confirming terminology is asked of the user even when the workspace policy allows', async () => {
  // The gate is unconditional by design: terminology confirmation is a user-authority
  // operation, not a workspace mutation, so a deployment that sets `policy: allow`
  // (which is the recommended first-trial setting) must not thereby let the model
  // promote its own inferred terms to authority.
  const stub = stubContext()
  ieg.apply(stub.ctx, { workspace: { policy: 'allow' } })
  const gate = stub.listeners.get('tools/pre-execute')[0]
  const next = async () => ({ kind: 'allow' })

  const asked = await gate({ name: 'confirm_terminology', arguments: { term: 'scope' }, agent: { id: 'a1' } }, next)
  assert.equal(asked.kind, 'ask', 'confirmation must always be routed through the approval service')
  assert.match(asked.reason, /explicit approval/)

  // The same policy does let an ordinary mutation through, so the `ask` above is the
  // confirmation rule and not the workspace policy.
  const allowed = await gate({ name: 'write', arguments: { file_path: 'notes/x.md', content: 'body' }, agent: { id: 'a1' } }, next)
  assert.equal(allowed.kind, 'allow')
})

test('R8-01: the confirmation tool is registered, and its body carries user provenance', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, {})
  stub.mountTools()
  const tool = stub.tools.find((entry) => entry.name === 'confirm_terminology')
  assert.ok(tool, 'the confirmation tool must be registered')
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['aliases', 'definition', 'scope', 'term'])

  const result = await tool.execute({ term: 'Information Environment', definition: 'the persistent information an agent works with' }, { agent: { id: 'a1' } })
  assert.equal(result.confirmed, true)
  assert.equal(result.status, 'CONFIRMED')
  assert.equal(result.source, 'user', 'a confirmed entry is user-sourced, never agent-inferred')
})

/* ── R8-02: the information-integrity lifecycle, end to end ─────────────────── */

test('R8-02: the lifecycle runs in the real path, and stale reuse is detected', async () => {
  const stub = stubContext()
  ieg.apply(stub.ctx, { workspace: { policy: 'allow' } })
  stub.mountTools()
  const agent = { id: 'a1' }
  const record = stub.tools.find((entry) => entry.name === 'record_information')
  const confirm = stub.tools.find((entry) => entry.name === 'confirm_information')
  const gate = stub.listeners.get('tools/pre-execute')[0]
  const next = async () => ({ kind: 'allow' })

  // 1. valid information: recorded as PROVISIONAL, never authoritative by recording
  const created = await record.execute({ id: 'api-version', value: 'The API is v1' }, { agent })
  assert.equal(created.ok, true)
  assert.equal(created.record.status, 'PROVISIONAL')

  // 2. promotion without evidence is refused by the lifecycle itself
  const premature = await record.execute({ id: 'api-version', status: 'AUTHORITATIVE' }, { agent })
  assert.equal(premature.ok, false)
  assert.match(premature.reason, /requires evidence or explicit user confirmation/)

  // 3. promotion with evidence is legitimate
  const promoted = await record.execute({ id: 'api-version', status: 'AUTHORITATIVE', evidence: 'upstream release notes' }, { agent })
  assert.equal(promoted.ok, true)
  assert.equal(promoted.record.status, 'AUTHORITATIVE')

  // 4. invalidation + correction: the stale text is retained for detection
  const corrected = await record.execute({ id: 'api-version', value: 'The API is v2', disposition: 'CORRECTED' }, { agent })
  assert.equal(corrected.ok, true)
  assert.equal(corrected.record.status, 'INVALID')
  assert.equal(corrected.record.value, 'The API is v2')
  assert.equal(corrected.record.disposedValue, 'The API is v1')

  // 5. supersession
  await record.execute({ id: 'endpoint', value: 'use /v1/items' }, { agent })
  const superseded = await record.execute({ id: 'endpoint', status: 'SUPERSEDED' }, { agent })
  assert.equal(superseded.record.status, 'SUPERSEDED')

  // 6. attempted stale reuse is surfaced in the real write path
  await gate({ name: 'write', arguments: { file_path: 'notes/api.md', content: 'The API is v1' }, agent }, next)
  const reintroduced = stub.logs.filter((entry) => entry.message.includes('information_reintroduced'))
  assert.equal(reintroduced.length, 1, 're-writing the corrected value must be reported')
  assert.match(reintroduced[0].message, /id=api-version/)

  // 7. reintroduction of the superseded value is caught too
  await gate({ name: 'write', arguments: { file_path: 'notes/endpoints.md', content: 'use /v1/items' }, agent }, next)
  assert.equal(stub.logs.filter((entry) => entry.message.includes('information_reintroduced')).length, 2)

  // A legitimate document that reuses nothing is not reported.
  await gate({ name: 'write', arguments: { file_path: 'notes/other.md', content: 'something else entirely' }, agent }, next)
  assert.equal(stub.logs.filter((entry) => entry.message.includes('information_reintroduced')).length, 2)

  // 8. legitimate revalidation requires user authority: the call is always asked of the
  // user, and its body — reached only on approval — restores authoritative status.
  const asked = await gate({ name: 'confirm_information', arguments: { id: 'api-version' }, agent }, next)
  assert.equal(asked.kind, 'ask')
  const revalidated = await confirm.execute({ id: 'api-version', evidence: 'the user confirmed v2 is current' }, { agent })
  assert.equal(revalidated.ok, true)
  assert.equal(revalidated.record.status, 'AUTHORITATIVE')
  assert.equal(revalidated.record.value, 'The API is v2')
})

/* ── P1-1: a complete restatement of the shipped row must mount cleanly ─────── */

/**
 * The top-level keys the shipped patch declares under `config:`.
 *
 * Read textually rather than through a YAML parser: the parser is only available when the
 * DSH-installed `yaml` happens to resolve, and a check that skips itself is not a check.
 *
 * @returns {string[]}
 */
function shippedRowKeys() {
  const text = readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^\s*config:\s*$/.test(line))
  assert.ok(start >= 0, 'the shipped patch must declare a config block')
  /** @param {string} line */
  const indentOf = (line) => (line.match(/^\s*/) ?? [''])[0].length
  const base = indentOf(lines[start])
  /** @type {string[]} */
  const keys = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (indentOf(line) <= base) break
    const match = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(trimmed)
    if (match !== null && indentOf(line) === base + 2) keys.push(match[1])
  }
  return keys
}

/**
 * The shipped row, restated in full.
 *
 * Phase 13 recorded an unexplained `ieg.config_invalid` when a complete restatement of the
 * plugin's own row was mounted, while `--dump-config` accepted it: a patch replaces a row's
 * whole config rather than merging, so the restatement is exactly what an override layer
 * writes. This is that input, with every top-level key explicit.
 */
const RESTATED_ROW = {
  enabled: true,
  sectionOrder: 8500,
  modules: {
    'project-governance': { enabled: true },
    'information-integrity': { enabled: true },
    'workspace-governance': { enabled: true },
  },
  workspace: {
    policy: 'ask',
    mutatingTools: ['write', 'edit', 'str_replace_editor'],
    protectedPaths: [],
    classifyShellCommands: true,
    overlapCheck: 'ask',
  },
  preStep: { orientationGate: 'off', requireBeforeMutation: false },
  prompt: { mode: 'compiled', append: '', file: '', allowOverBudget: false },
  diagnosticsExport: { file: '', limit: 50 },
  diagnostics: true,
}

test('P1-1: a complete restatement of the shipped row validates and mounts cleanly', async () => {
  // Drift protection: if the shipped row gains a top-level key, this fails until the
  // restatement is updated too — so the incident's exact input cannot silently go stale.
  assert.deepEqual(
    Object.keys(RESTATED_ROW).sort(),
    shippedRowKeys().sort(),
    'the restatement must name every top-level key the shipped row declares',
  )

  assert.doesNotThrow(() => ieg.resolveConfig(RESTATED_ROW), 'the restatement must validate')
  // `buildGovernance` is what threw on the shipped configuration in the earlier test.
  assert.doesNotThrow(() => ieg.buildGovernance(RESTATED_ROW), 'the restatement must compile')

  const stub = stubContext()
  ieg.apply(stub.ctx, RESTATED_ROW)
  stub.mountTools()
  const status = stub.tools.find((tool) => tool.name === ieg.STATUS_TOOL_NAME)
  assert.ok(status, 'the status tool must be registered')
  const report = await status.execute({}, {})

  assert.equal(report.mount.mounted, true, 'a complete restatement must mount')
  assert.equal(report.mount.configError, undefined, 'a complete restatement must report no configuration error')
  assert.ok(
    !report.diagnostics.some((entry) => entry.code === 'ieg.config_invalid'),
    'a complete restatement must not produce ieg.config_invalid',
  )
  assert.ok(stub.sections.length > 0, 'a mounted row contributes its prompt section')

  // A second class of cause is ruled out: feeding a *resolved* config back in. Phase 13's
  // restatement was generated programmatically, and a resolved shape carrying keys the input
  // schema rejects would explain `ieg.config_invalid` exactly. It does not.
  assert.doesNotThrow(() => ieg.resolveConfig(ieg.resolveConfig(RESTATED_ROW)))
})
