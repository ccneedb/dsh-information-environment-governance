import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyMutation,
  decideMutation,
  extractTargets,
  isProtectedPath,
  guardBackstop,
} from '../../lib/modules/workspace-governance.js'

const POLICY = { mutatingTools: ['write', 'edit', 'bash'], protectedPaths: [] }

test('a tool outside the mutating set is read-only', () => {
  const classification = classifyMutation('read', { file_path: '/tmp/x' }, POLICY)
  assert.equal(classification.kind, 'read-only')
  assert.deepEqual(decideMutation(classification, { policy: 'deny', protectedPaths: [] }), { kind: 'allow' })
})

test('a mutating tool is classified with its targets', () => {
  const classification = classifyMutation('write', { file_path: '/w/a.txt' }, POLICY)
  assert.equal(classification.kind, 'persistent-mutation')
  assert.deepEqual(classification.targets, ['/w/a.txt'])
})

test('targets are extracted from every known argument key', () => {
  assert.deepEqual(extractTargets('write', { file_path: '/a', path: '/b' }), ['/a', '/b'])
  assert.deepEqual(extractTargets('edit', { target: '/c' }), ['/c'])
  assert.deepEqual(extractTargets('read', { nope: 1 }), [])
})

test('a shell command becomes an opaque shell target', () => {
  const targets = extractTargets('bash', { command: 'rm -rf build' })
  assert.deepEqual(targets, ['<shell> rm -rf build'])
})

test('protected paths match the path itself and anything beneath it', () => {
  const protectedPaths = ['/repo/secrets', '/repo/.env']
  assert.equal(isProtectedPath('/repo/secrets', protectedPaths), true)
  assert.equal(isProtectedPath('/repo/secrets/key.pem', protectedPaths), true)
  assert.equal(isProtectedPath('/repo/.env', protectedPaths), true)
  // A sibling with a shared prefix must not match.
  assert.equal(isProtectedPath('/repo/secrets-public/key.pem', protectedPaths), false)
  assert.equal(isProtectedPath('/repo/src/index.ts', protectedPaths), false)
})

test('the ask policy delegates the decision to the host approval service', () => {
  const classification = classifyMutation('write', { file_path: '/w/a' }, POLICY)
  const decision = decideMutation(classification, { policy: 'ask', protectedPaths: [] })
  assert.equal(decision.kind, 'ask')
  assert.match(/** @type {any} */ (decision).reason, /confirm persistent workspace mutation/)
})

test('the deny policy refuses outright', () => {
  const classification = classifyMutation('write', { file_path: '/w/a' }, POLICY)
  const decision = decideMutation(classification, { policy: 'deny', protectedPaths: [] })
  assert.equal(decision.kind, 'deny')
})

test('the allow policy admits the mutation', () => {
  const classification = classifyMutation('write', { file_path: '/w/a' }, POLICY)
  assert.deepEqual(decideMutation(classification, { policy: 'allow', protectedPaths: [] }), { kind: 'allow' })
})

test('a protected path is refused even under the allow policy', () => {
  const policy = { mutatingTools: ['write'], protectedPaths: ['/repo/secrets'] }
  const classification = classifyMutation('write', { file_path: '/repo/secrets/key.pem' }, policy)
  assert.equal(classification.protected, true)
  const decision = decideMutation(classification, policy)
  assert.equal(decision.kind, 'deny')
  assert.match(/** @type {any} */ (decision).reason, /protected path/)
})

test('the monotonic guard backstop denies protected mutations only', () => {
  const policy = { mutatingTools: ['write'], protectedPaths: ['/repo/secrets'] }

  assert.match(
    String(guardBackstop({ name: 'write', arguments: { file_path: '/repo/secrets/x' } }, policy)),
    /protected path/,
  )
  assert.equal(guardBackstop({ name: 'write', arguments: { file_path: '/repo/src/x' } }, policy), undefined)
  // `read` is not in the mutating set, so it is never a mutation to guard.
  assert.equal(guardBackstop({ name: 'read', arguments: { file_path: '/repo/secrets/x' } }, policy), undefined)
  // With no protected paths configured the guard is inert.
  assert.equal(
    guardBackstop({ name: 'write', arguments: { file_path: '/repo/secrets/x' } }, { mutatingTools: ['write'], protectedPaths: [] }),
    undefined,
  )
})

/* ── R8-03: protected-path canonicalisation, adversarial and fuzz-style ─────── */

/** The boundary used by the canonicalisation cases below. */
const SECRETS = '/repo/secrets'

test('R8-03: a protected boundary is judged after lexical canonicalisation', () => {
  const cases = [
    ['/repo/secrets/key', true, 'the direct path'],
    ['/repo/./secrets/key', true, 'a current-directory segment used as a detour'],
    ['/repo/mods/../secrets/key', true, 'a parent-directory detour'],
    ['/repo//secrets///key', true, 'repeated separators'],
    ['/repo/secrets/', true, 'the boundary itself with a trailing separator'],
    ['/repo/secrets', true, 'the boundary itself'],
    ['\\repo\\secrets\\key', true, 'Windows-style separators, normalised not honoured'],
    ['/etc/../repo/secrets/key', true, 'a detour through an unrelated absolute prefix'],
    ['/repo/secrets-other/key', false, 'a sibling whose name merely starts with the boundary'],
    ['/repo/secretsx', false, 'a name the boundary is a prefix of'],
    ['/repo/public/key', false, 'an unrelated path'],
  ]
  for (const [target, expected, why] of cases) {
    assert.equal(isProtectedPath(String(target), [SECRETS]), expected, `${target} — ${why}`)
  }
})

test('R8-03: a root boundary protects everything, and relative paths keep their meaning', () => {
  assert.equal(isProtectedPath('/anything/at/all', ['/']), true)
  assert.equal(isProtectedPath('x', ['/']), false, 'a relative path is not an absolute one')
  assert.equal(isProtectedPath('repo/secrets/key', ['repo/secrets']), true)
  assert.equal(isProtectedPath('repo/./secrets/key', ['repo/secrets']), true)
  // Leading `..` segments are meaningful without a cwd, so they are retained rather
  // than collapsed away.
  assert.equal(isProtectedPath('../../etc/passwd', ['etc']), false)
})

test('R8-03: fuzz-style path variants all canonicalise to the boundary', () => {
  // A deterministic pseudo-random generator: the point is breadth of shape, not
  // unpredictability, so the case is reproducible in CI.
  let seed = 20261005
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  // Only **net-zero** detours belong here. A bare `..` can legitimately leave the
  // boundary — `/repo/mods/../../secrets/key` really does resolve to `/secrets/key` —
  // and the classifier is right to let it through, so the contrast is asserted below
  // rather than smuggled in as a variant.
  const detours = ['.', '', './', 'mods/..', 'a/b/../..', './/.']
  let checked = 0
  for (let i = 0; i < 400; i += 1) {
    const prefix = Array.from({ length: 1 + Math.floor(next() * 3) }, () => detours[Math.floor(next() * detours.length)]).join('/')
    const separator = next() < 0.2 ? '\\' : '/'
    const trailing = next() < 0.3 ? separator : ''
    const variant = `/repo/${prefix}${prefix === '' ? '' : '/'}secrets${separator}key${trailing}`
    assert.equal(isProtectedPath(variant, [SECRETS]), true, `variant must stay protected: ${variant}`)
    checked += 1
  }
  assert.equal(checked, 400)

  // The contrast: a detour that genuinely resolves elsewhere is not called protected.
  // This is the property that makes the fuzz case above meaningful rather than trivial.
  assert.equal(isProtectedPath('/repo/mods/../../secrets/key', [SECRETS]), false, 'resolves to /secrets/key')
  assert.equal(isProtectedPath('/repo/../secrets/key', [SECRETS]), false, 'resolves to /secrets/key')
})
