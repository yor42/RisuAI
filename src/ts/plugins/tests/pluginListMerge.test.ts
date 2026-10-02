/**
 * Spec tests for the pure plugin-list merge module `src/ts/plugins/pluginListMerge.ts`.
 * They are specifications of the new module, not regression reproducers: the
 * behaviour tests in `pluginListWrites.svelte.test.ts` are the evidence for the
 * change itself.
 *
 * Signatures assumed here (the module's contract beyond them is not frozen):
 * - `compareVersions(v1: string, v2: string): 0 | 1 | -1`, with the behaviour
 *   the host's version comparison has always had.
 * - `parsePluginHeader(script: string)` returns either an object with a string
 *   `error` (the text `importPlugin` shows today) or the derived fields as one
 *   flat object: `name`, `displayName`, `arguments`, `realArg` (header
 *   defaults), `argMeta`, `customLink`, `versionOfPlugin`, `updateURL`,
 *   `allowedIPC`. Only `fieldsOf` and `errorOf` below read that shape.
 * - `carrySavedValues(liveOld: RisuPlugin, derived: RisuPlugin): RisuPlugin`
 *   returns `derived` with `realArg` and `enabled` carried from `liveOld`.
 * - `classifyPluginList(live: RisuPlugin[], incoming: unknown[])` returns an
 *   object whose `ignored`, `updates`, `installs` and `refused` are arrays.
 *   Only their lengths are asserted.
 * - `applyPluginChanges(live: RisuPlugin[], classified)` takes the object
 *   `classifyPluginList` returned (all of it accepted) and returns the new list
 *   as an array, or something that is not an array when an accepted change no
 *   longer applies to `live`. Neither argument is mutated.
 */
import { describe, test, expect } from 'vitest'
import type { RisuPlugin } from '../plugins.svelte'
import { compareVersions, parsePluginHeader, carrySavedValues, classifyPluginList, applyPluginChanges } from '../pluginListMerge'

//#region fixtures

function script(name: string, version: string | null, args: string[] = [], extra: string[] = []): string {
    const lines = [`//@name ${name}`, '//@api 3.0']
    if (version !== null) lines.push(`//@version ${version}`)
    for (const arg of args) lines.push(`//@arg ${arg}`)
    lines.push(...extra, `// body ${name} ${version ?? ''}`)
    return lines.join('\n')
}

function entry(name: string, version: string, args: Record<string, 'int' | 'string'>, realArg: Record<string, string | number>, enabled: boolean | undefined, body = ''): RisuPlugin {
    const argLines = Object.entries(args).map(([k, t]) => `${k} ${t}`)
    return {
        name,
        script: script(name, version, argLines) + body,
        arguments: args,
        realArg,
        version: '3.0',
        customLink: [],
        argMeta: {},
        versionOfPlugin: version,
        updateURL: '',
        allowedIPC: [],
        enabled,
    } as RisuPlugin
}

const fieldsOf = (result: unknown) => result as Record<string, unknown>
const errorOf = (result: unknown) => (result as { error?: string }).error

const liveA = () => entry('plug-a', '1.0.0', { key: 'string' }, { key: 'secret-a' }, true)
const liveB = () => entry('plug-b', '1.0.0', { k: 'string', cb: 'int' }, { k: 'secret-b', cb: '1' }, false)
const liveU = () => entry('plug-u', '1.0.0', { u: 'string' }, { u: 'secret-u' }, undefined)

//#endregion

describe('compareVersions', () => {
    test.each([
        ['1.1.0', '1.0.0', 1],
        ['1.0.0', '1.1.0', -1],
        ['1.0', '1.0.0', 0],
        ['10.0.0', '9.9.9', 1],
        ['0.0.1', '0.0.0', 1],
        ['2.0.0', '2.0.0-rc1', 0],
        ['1.0.0-rc2', '1.0.0-rc1', 0],
        ['1.1.0', '1.1.0-beta.2', -1],
        ['2.0.0', '', 1],
        ['', '2.0.0', -1],
        ['', '', 0],
    ])('compares %j with %j as %i, as the host always has', (left, right, expected) => {
        expect(compareVersions(left, right)).toBe(expected)
    })
})

describe('parsePluginHeader', () => {
    test('derives the entry fields, with default values for declared arguments, from a 3.0 header', () => {
        const source = [
            '//@name plug-x',
            '//@display-name Plug X',
            '//@api 3.0',
            '//@version 1.2.3',
            '//@update-url https://example.invalid/x.js',
            '//@link https://example.invalid/x hover text',
            '//@arg k string',
            '//@arg n int {{checkbox}}',
            '//@allowed-ipc plug-a plug-b',
            '// body',
        ].join('\n')

        const parsed = fieldsOf(parsePluginHeader(source))

        expect(errorOf(parsed)).toBeUndefined()
        expect(parsed.name).toBe('plug-x')
        expect(parsed.displayName).toBe('Plug X')
        expect(parsed.versionOfPlugin).toBe('1.2.3')
        expect(parsed.updateURL).toBe('https://example.invalid/x.js')
        expect(parsed.customLink).toEqual([{ link: 'https://example.invalid/x', hoverText: 'hover text' }])
        expect(parsed.arguments).toEqual({ k: 'string', n: 'int' })
        expect(parsed.realArg).toEqual({ k: '', n: 0 })
        expect(parsed.argMeta).toEqual({ n: { checkbox: '1' } })
        expect(parsed.allowedIPC).toEqual(['plug-a', 'plug-b'])
    })

    test('strips a leading byte order mark for parsing', () => {
        const parsed = fieldsOf(parsePluginHeader(`﻿${script('plug-x', '1.0.0')}`))

        expect(errorOf(parsed)).toBeUndefined()
        expect(parsed.name).toBe('plug-x')
    })

    test.each([
        ['an empty name', '//@name\n//@api 3.0', 'plugin name must be longer than 0, did you put it correctly?'],
        ['no name', '//@api 3.0\n// body', 'plugin name not found, did you put it correctly?'],
        ['an argument without a type', '//@name plug-x\n//@api 3.0\n//@arg x', 'plugin argument is incorrect, did you put space in argument name?'],
        ['an unknown argument type', '//@name plug-x\n//@api 3.0\n//@arg x float', 'plugin argument type is "float", which is an unknown type.'],
        ['a link that is not https', '//@name plug-x\n//@api 3.0\n//@link http://example.invalid/x', 'plugin link must start with https, did you check it?'],
        ['an update URL that is not https', '//@name plug-x\n//@api 3.0\n//@version 1.0.0\n//@update-url http://example.invalid/x.js', 'plugin update URL must start with https, did you put it correctly?'],
        ['an update URL without a version', '//@name plug-x\n//@api 3.0\n//@update-url https://example.invalid/x.js', 'plugin version not found, did you put it correctly? It is required when update URL is provided.'],
        ['a version below 0.0.1', '//@name plug-x\n//@api 3.0\n//@version 0.0.0', 'plugin version must be at least 0.0.1'],
    ])('reports %s with the text importPlugin shows', (_label, source, text) => {
        expect(errorOf(parsePluginHeader(source))).toBe(text)
    })
})

describe('carrySavedValues', () => {
    test('keeps the saved value of an argument the new header still declares with the same type, a checkbox int staying a string', () => {
        const derived = entry('plug-b', '1.1.0', { k: 'string', cb: 'int' }, { k: '', cb: 0 }, true)

        const carried = carrySavedValues(liveB(), derived)

        expect(carried.realArg).toEqual({ k: 'secret-b', cb: '1' })
    })

    test('takes the header default for a retyped or new argument and drops an argument the new header does not declare', () => {
        const old = entry('plug-b', '1.0.0', { k: 'string', t: 'string', gone: 'string' }, { k: 'secret-b', t: 'text', gone: 'x' }, true)
        const derived = entry('plug-b', '1.1.0', { k: 'string', t: 'int', fresh: 'string' }, { k: '', t: 0, fresh: '' }, true)

        const carried = carrySavedValues(old, derived)

        expect(carried.realArg).toEqual({ k: 'secret-b', t: 0, fresh: '' })
    })

    test('copies the on/off state verbatim, an unset state staying unset', () => {
        const derived = (name: string) => entry(name, '1.1.0', { u: 'string' }, { u: '' }, true)

        expect(carrySavedValues(liveB(), derived('plug-b')).enabled).toBe(false)
        expect(carrySavedValues(liveA(), derived('plug-a')).enabled).toBe(true)
        expect(carrySavedValues(liveU(), derived('plug-u')).enabled).toBeUndefined()
    })

    test('does not change either argument', () => {
        const old = liveB()
        const derived = entry('plug-b', '1.1.0', { k: 'string', cb: 'int' }, { k: '', cb: 0 }, true)
        const oldCopy = structuredClone(old)
        const derivedCopy = structuredClone(derived)

        carrySavedValues(old, derived)

        expect(old).toEqual(oldCopy)
        expect(derived).toEqual(derivedCopy)
    })
})

describe('classifyPluginList', () => {
    const counts = (live: RisuPlugin[], incoming: unknown[]) => {
        const result = classifyPluginList(live, incoming as RisuPlugin[]) as unknown as Record<'ignored' | 'updates' | 'installs' | 'refused', unknown[]>
        return { ignored: result.ignored.length, updates: result.updates.length, installs: result.installs.length, refused: result.refused.length }
    }
    const live = () => [liveA(), liveB(), liveU()]

    test('ignores entries equal by value to the installed ones, even as new objects, and entries whose only difference is a field edit', () => {
        const incoming = [structuredClone(liveA()), { ...liveB(), realArg: { k: 'changed', cb: '0' }, enabled: true }, liveU()]

        expect(counts(live(), incoming)).toEqual({ ignored: 3, updates: 0, installs: 0, refused: 0 })
    })

    test('treats a script-changed entry with a strictly newer header version as an update', () => {
        const incoming = [liveA(), { ...liveB(), script: script('plug-b', '1.1.0', ['k string', 'cb int']) }, liveU()]

        expect(counts(live(), incoming)).toEqual({ ignored: 2, updates: 1, installs: 0, refused: 0 })
    })

    test.each([
        ['the same version', '1.0.0'],
        ['an older version', '0.9.0'],
        ['a pre-release of the installed version', '1.0.0-rc1'],
    ])('ignores a script-changed entry with %s', (_label, version) => {
        const incoming = [{ ...liveA(), script: script('plug-a', version, ['key string'], ['// other']) }]

        expect(counts(live(), incoming)).toEqual({ ignored: 1, updates: 0, installs: 0, refused: 0 })
    })

    test.each([
        ['an empty installed version', ''],
        ['an absent installed version', undefined],
        ['a numeric installed version', 2],
    ])('ignores a script-changed entry when the installed entry has %s', (_label, installedVersion) => {
        const installed = [{ ...liveA(), versionOfPlugin: installedVersion } as unknown as RisuPlugin]
        const incoming = [{ ...liveA(), script: script('plug-a', '2.0.0', ['key string']) }]

        expect(counts(installed, incoming)).toEqual({ ignored: 1, updates: 0, installs: 0, refused: 0 })
    })

    test('ignores a script-changed entry whose header has no version', () => {
        const incoming = [{ ...liveA(), script: script('plug-a', null, ['key string']) }]

        expect(counts(live(), incoming)).toEqual({ ignored: 1, updates: 0, installs: 0, refused: 0 })
    })

    test('treats a new name with a valid 3.0 header naming it as an install', () => {
        const incoming = [...live(), entry('plug-c', '1.0.0', { token: 'string' }, { token: 'supplied' }, false)]

        expect(counts(live(), incoming)).toEqual({ ignored: 3, updates: 0, installs: 1, refused: 0 })
    })

    test.each([
        ['an API 2.1 header', (name: string) => `//@name ${name}\n//@api 2.1\n//@version 1.0.0`],
        ['a header with no API', (name: string) => `//@name ${name}\n//@version 1.0.0`],
        ['a header that does not parse', (name: string) => script(name, '1.0.0', ['x float'])],
        ['a header that names another plugin', () => script('plug-other', '1.0.0')],
    ])('refuses a new name whose script has %s', (_label, make) => {
        const incoming = [{ ...entry('plug-c', '1.0.0', {}, {}, true), script: make('plug-c') }]

        expect(counts(live(), incoming)).toEqual({ ignored: 0, updates: 0, installs: 0, refused: 1 })
    })

    test('refuses an update whose header names another plugin or does not parse, even when its version is not newer', () => {
        const incoming = [
            { ...liveA(), script: script('plug-other', '9.0.0') },
            { ...liveB(), script: script('plug-b', '1.0.0', ['k float']) },
        ]

        expect(counts(live(), incoming)).toEqual({ ignored: 0, updates: 0, installs: 0, refused: 2 })
    })

    test('counts the first entry of a repeated name and ignores the later ones', () => {
        const first = entry('plug-c', '1.0.0', { token: 'string' }, {}, true)
        const later = entry('plug-c', '2.0.0', { token: 'string' }, {}, true)

        expect(counts(live(), [first, later])).toEqual({ ignored: 1, updates: 0, installs: 1, refused: 0 })
    })

    test('ignores entries without a string name or without a string script', () => {
        const incoming = [{ ...liveA(), name: undefined }, { ...liveB(), script: undefined }, { script: 'x' }, null]

        expect(counts(live(), incoming)).toEqual({ ignored: 4, updates: 0, installs: 0, refused: 0 })
    })

    test('does not change its arguments', () => {
        const installed = live()
        const incoming = [liveA(), { ...liveB(), script: script('plug-b', '1.1.0', ['k string', 'cb int']) }]
        const installedCopy = structuredClone(installed)
        const incomingCopy = structuredClone(incoming)

        classifyPluginList(installed, incoming)

        expect(installed).toEqual(installedCopy)
        expect(incoming).toEqual(incomingCopy)
    })
})

describe('applyPluginChanges', () => {
    const live = () => [liveA(), liveB(), liveU()]
    const updateOfB = () => ({ ...liveB(), script: script('plug-b', '1.1.0', ['k string', 'cb int']) })
    const installOfC = () => entry('plug-c', '1.0.0', { token: 'string' }, { token: 'supplied' }, false)
    const names = (list: unknown) => (list as RisuPlugin[]).map((p) => p.name)

    test('replaces an update in place with the carried values and appends installs after the existing plugins in incoming order', () => {
        const installed = live()
        const classified = classifyPluginList(installed, [liveA(), updateOfB(), liveU(), installOfC(), entry('plug-d', '1.0.0', {}, {}, true)])

        const applied = applyPluginChanges(installed, classified)

        expect(Array.isArray(applied)).toBe(true)
        expect(names(applied)).toEqual(['plug-a', 'plug-b', 'plug-u', 'plug-c', 'plug-d'])
        const b = (applied as RisuPlugin[])[1]
        expect(b.versionOfPlugin).toBe('1.1.0')
        expect(b.realArg).toEqual({ k: 'secret-b', cb: '1' })
        expect(b.enabled).toBe(false)
        const c = (applied as RisuPlugin[])[3]
        expect(c.realArg).toEqual({ token: '' })
        expect(c.enabled).toBe(true)
    })

    test('reads the saved values and the on/off state from the live list it is given, not from the list that was classified', () => {
        const classified = classifyPluginList(live(), [liveA(), updateOfB(), liveU()])
        const changed = live()
        changed[1].realArg = { k: 'edited-meanwhile', cb: '0' }
        changed[1].enabled = true

        const applied = applyPluginChanges(changed, classified) as RisuPlugin[]

        expect(applied[1].realArg).toEqual({ k: 'edited-meanwhile', cb: '0' })
        expect(applied[1].enabled).toBe(true)
    })

    test('keeps a plugin that was added to the live list after classification and does not bring back one that was removed', () => {
        const classified = classifyPluginList(live(), [liveA(), updateOfB(), liveU()])

        const withAddition = applyPluginChanges([...live(), entry('plug-z', '1.0.0', {}, {}, true)], classified)
        const withRemoval = applyPluginChanges(live().filter((p) => p.name !== 'plug-a'), classified)

        expect(names(withAddition)).toEqual(['plug-a', 'plug-b', 'plug-u', 'plug-z'])
        expect(names(withRemoval)).toEqual(['plug-b', 'plug-u'])
    })

    test.each([
        ['removed', (list: RisuPlugin[]) => list.filter((p) => p.name !== 'plug-b')],
        ['replaced by another script', (list: RisuPlugin[]) => list.map((p) => (p.name === 'plug-b' ? { ...p, script: script('plug-b', '1.2.0') } : p))],
    ])('fails when the plugin an accepted update targets was %s meanwhile', (_label, change) => {
        const classified = classifyPluginList(live(), [liveA(), updateOfB(), liveU()])

        const applied = applyPluginChanges(change(live()), classified)

        expect(Array.isArray(applied)).toBe(false)
    })

    test('fails when the name of an accepted install was taken meanwhile', () => {
        const classified = classifyPluginList(live(), [...live(), installOfC()])

        const applied = applyPluginChanges([...live(), entry('plug-c', '1.0.0', {}, {}, true)], classified)

        expect(Array.isArray(applied)).toBe(false)
    })

    test('does not change the live list it is given', () => {
        const installed = live()
        const classified = classifyPluginList(installed, [liveA(), updateOfB(), liveU(), installOfC()])
        const copy = structuredClone(installed)

        applyPluginChanges(installed, classified)

        expect(installed).toEqual(copy)
    })
})
