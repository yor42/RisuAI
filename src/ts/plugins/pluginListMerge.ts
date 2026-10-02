import type { RisuPlugin } from './plugins.svelte'

/**
 * The pure part of how a plugin's write to the plugin list is merged into the
 * installed list: the header parse, the version comparison, the rule for which
 * incoming entries are updates, installs, refusals or ignored, and the apply
 * step. No alerts, no database access, no store imports.
 *
 * This module imports nothing at runtime from `plugins.svelte.ts` (types only),
 * so that module can import it without a cycle.
 */

/** Compares versions part by part, splitting on dots. A part that is not a number counts as 0, and so does a missing part: `2.0.0-rc1` equals `2.0.0`, but a suffix containing a dot adds a part, so `1.0.0-rc.1` compares newer than `1.0.0`. */
export const compareVersions = (v1: string, v2: string): 0|1|-1 => {
    const v1parts = v1.split('.').map(Number);
    const v2parts = v2.split('.').map(Number);
    const len = Math.max(v1parts.length, v2parts.length);
    for (let i = 0; i < len; i++) {
        const part1 = v1parts[i] || 0;
        const part2 = v2parts[i] || 0;
        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }
    return 0;
}

//#region header

export interface PluginHeaderFields {
    name: string
    displayName: string | undefined
    arguments: RisuPlugin['arguments']
    /** The header's default value for each declared argument. */
    realArg: RisuPlugin['realArg']
    argMeta: RisuPlugin['argMeta']
    customLink: RisuPlugin['customLink']
    /** The plugin's own version, empty when the header has none. */
    versionOfPlugin: string
    updateURL: string
    allowedIPC: string[]
    /** The API version the header declares, '2.0' when it declares none that is supported. */
    apiVersion: '2.0' | '2.1' | '3.0'
}

export interface PluginHeaderError {
    error: string
}

export type PluginHeaderResult = PluginHeaderFields | PluginHeaderError

/**
 * Reads the `//@` header of a plugin script. A leading byte order mark is
 * ignored for parsing only. The result is either the derived fields or the text
 * of the first problem found, in the order the lines and checks come.
 */
export function parsePluginHeader(script: string): PluginHeaderResult {
    const jsFile = script.replace(/^\uFEFF/, '')
    const splitedJs = jsFile.split('\n')
    let name = ''
    let displayName: string | undefined = undefined
    const arg: RisuPlugin['arguments'] = {}
    const realArg: RisuPlugin['realArg'] = {}
    const argMeta: RisuPlugin['argMeta'] = {}
    const customLink: RisuPlugin['customLink'] = []
    let updateURL: string = ''
    let versionOfPlugin: string = '' //This is the version of the plugin itself, not the API version
    let apiVersion: PluginHeaderFields['apiVersion'] = '2.0'
    const ipcList: string[] = []
    for (const line of splitedJs) {
        if (line.startsWith('//@name')) {
            const provied = line.slice(7)
            if (provied === '') {
                return { error: 'plugin name must be longer than 0, did you put it correctly?' }
            }
            name = provied.trim()
        }
        if(line.startsWith('//@api')){
            const proviedVersions = line.slice(6).trim().split(' ')
            const supportedVersions = ['2.0','2.1','3.0']
            for(const ver of proviedVersions){
                if(supportedVersions.includes(ver)){
                    apiVersion = ver as PluginHeaderFields['apiVersion']
                    break
                }
                else{
                    console.warn(`Plugin API version "${ver}" is not supported.`)
                }
            }
        }
        if (line.startsWith('//@display-name')) {
            const provied = line.slice('//@display-name'.length + 1)
            if (provied === '') {
                return { error: 'plugin display name must be longer than 0, did you put it correctly?' }
            }
            displayName = provied.trim()
        }

        if (line.startsWith('//@link')) {
            const link = line.split(" ")[1]
            if (!link || link === '') {
                return { error: 'plugin link is empty, did you put it correctly?' }
            }
            if (!link.startsWith('https')) {
                return { error: 'plugin link must start with https, did you check it?' }
            }
            const hoverText = line.split(' ').slice(2).join(' ').trim()
            if (hoverText === '') {
                // OK, no hover text. It's fine.
                customLink.push({
                    link: link,
                    hoverText: undefined
                });
            }
            else
                customLink.push({
                    link: link,
                    hoverText: hoverText || undefined
                });
        }
        if (line.startsWith('//@risu-arg') || line.startsWith('//@arg')) {
            const provied = line.trim().split(' ')
            if (provied.length < 3) {
                return { error: 'plugin argument is incorrect, did you put space in argument name?' }
            }
            const provKey = provied[1]

            if (provied[2] !== 'int' && provied[2] !== 'string') {
                return { error: `plugin argument type is "${provied[2]}", which is an unknown type.` }
            }
            if (provied[2] === 'int') {
                arg[provKey] = 'int'
                realArg[provKey] = 0
            }
            else if (provied[2] === 'string') {
                arg[provKey] = 'string'
                realArg[provKey] = ''
            }

            if(provied.length > 3){
                const meta: {[key:string]:string} = {}
                //Compatibility layer for unofficial meta
                let metaStr = provied.slice(3).join(' ').replace(
                    /{{(.+?)(::?(.+?))?}}/g,
                    (a,g1:string,g2,g3:string) => {
                        console.log(g1,g3)
                        meta[g1] = g3 || '1'
                        return ''
                    }
                ).trim()

                if(metaStr){
                    meta['description'] = metaStr
                }

                argMeta[provKey] = meta
            }
        }

        if(line.startsWith('//@update-url')){
            updateURL = line.split(' ')[1]

            try {
                const url = new URL(updateURL)
                if(url.protocol !== 'https:'){
                    return { error: 'plugin update URL must start with https, did you put it correctly?' }
                }
            } catch (error) {
                return { error: 'plugin update URL is not a valid URL, did you put it correctly?' }
            }
        }

        if(line.startsWith('//@version')){
            versionOfPlugin = line.split(' ').slice(1).join(' ').trim()

            const versionLocation = jsFile.indexOf('//@version')
            const numberOfBytesBefore = new TextEncoder().encode(jsFile.slice(0, versionLocation) + line).length
            if(numberOfBytesBefore > 500){
                return { error: 'plugin version declaration must be within the first 512 Bytes of the file for proper parsing. move //@version line to the top of the file.' }
            }
        }

        if(line.startsWith('//@allowed-ipc')){
            const provied = line.trim().split(' ')
            if(provied.length < 2){
                return { error: 'plugin allowed IPC declaration is incorrect, did you put space after //@allowed-ipc?' }
            }

            const allowedIPCList = provied.slice(1)

            ipcList.push(...allowedIPCList)
        }
    }

    if (name.length === 0) {
        return { error: 'plugin name not found, did you put it correctly?' }
    }

    if(updateURL && versionOfPlugin.length === 0){
        return { error: 'plugin version not found, did you put it correctly? It is required when update URL is provided.' }
    }

    if(versionOfPlugin && compareVersions(versionOfPlugin, '0.0.1') === -1){
        return { error: 'plugin version must be at least 0.0.1' }
    }

    return {
        name,
        displayName,
        arguments: arg,
        realArg,
        argMeta,
        customLink,
        versionOfPlugin,
        updateURL,
        allowedIPC: ipcList,
        apiVersion,
    }
}

/** The text shown when a header declares an API version a plugin cannot be installed with, or null when it declares 3.0. */
export function apiVersionRefusal(apiVersion: PluginHeaderFields['apiVersion']): string | null {
    if (apiVersion === '2.1') {
        return 'Your plugin specifies API version 2.1, which is outdated and no longer supported. Please update your plugin to use at least API version 3.0.'
    }
    if (apiVersion === '2.0') {
        return 'Your code does not include //@api or specifies API version 2.0, which is outdated. Please update your plugin to use at least API version 3.0.'
    }
    return null
}

/** The stored entry for `script` as its header describes it: header defaults for the saved values, switched on. */
export function pluginEntryFromHeader(script: string, header: PluginHeaderFields): RisuPlugin {
    return {
        name: header.name,
        script,
        realArg: header.realArg,
        arguments: header.arguments,
        displayName: header.displayName,
        version: '3.0',
        customLink: header.customLink,
        argMeta: header.argMeta,
        versionOfPlugin: header.versionOfPlugin,
        updateURL: header.updateURL,
        allowedIPC: header.allowedIPC,
        enabled: true,
    }
}

//#endregion

//#region carrying saved values

function sameDeclaredType(left: RisuPlugin['arguments'][string] | undefined, right: RisuPlugin['arguments'][string] | undefined): boolean {
    return left !== undefined && right !== undefined && JSON.stringify(left) === JSON.stringify(right)
}

/**
 * `derived` with the saved values and the on/off state of `liveOld`. An
 * argument keeps its saved value only when the new header still declares it
 * with the same declared type; the type is compared as declared, never by the
 * value's runtime type, because an int checkbox stores a string. Every other
 * argument takes the header default. `enabled` is copied as it is, so an unset
 * state stays unset. Neither argument is changed.
 */
export function carrySavedValues(liveOld: RisuPlugin, derived: RisuPlugin): RisuPlugin {
    const realArg: RisuPlugin['realArg'] = { ...derived.realArg }
    const oldValues = liveOld.realArg ?? {}
    for (const key of Object.keys(derived.arguments ?? {})) {
        if (!sameDeclaredType(liveOld.arguments?.[key], derived.arguments[key])) {
            continue
        }
        if (Object.prototype.hasOwnProperty.call(oldValues, key) && oldValues[key] !== undefined) {
            realArg[key] = oldValues[key]
        }
    }
    return { ...derived, realArg, enabled: liveOld.enabled }
}

//#endregion

//#region classification

export interface PluginUpdateChange {
    /** Position of the entry in the incoming list. */
    index: number
    name: string
    /** The entry the header describes, with header defaults for the saved values. */
    entry: RisuPlugin
    /** The installed script this change was classified against. */
    baseScript: string
    fromVersion: string
    toVersion: string
}

export interface PluginInstallChange {
    index: number
    name: string
    entry: RisuPlugin
}

export interface PluginRefusal {
    index: number
    name: string
    reason: string
}

export type PluginIgnoredKind = 'malformed' | 'duplicate-name' | 'same-script' | 'not-newer'

export interface PluginIgnoredEntry {
    index: number
    kind: PluginIgnoredKind
    /** Absent for a malformed entry that has no usable name. */
    name?: string
    /** Set for 'not-newer': the installed version, undefined when the installed entry has none. */
    installedVersion?: string
    /** Set for 'not-newer': the version the incoming header declares, empty when it has none. */
    incomingVersion?: string
    /** What to log, or null for an entry that is a plain round trip. */
    warning: string | null
}

export interface PluginListClassification {
    ignored: PluginIgnoredEntry[]
    updates: PluginUpdateChange[]
    installs: PluginInstallChange[]
    refused: PluginRefusal[]
}

/** A version counts only when it is a string that is not blank. */
export function isUsableVersion(version: unknown): version is string {
    return typeof version === 'string' && version.trim().length > 0
}

function valuesEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true
    }
    if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
        return false
    }
    if (Array.isArray(left) !== Array.isArray(right)) {
        return false
    }
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])
    for (const key of keys) {
        if (!valuesEqual(leftRecord[key], rightRecord[key])) {
            return false
        }
    }
    return true
}

/** The fields other than `script` in which two entries with the same script differ. */
function differingFields(live: RisuPlugin, incoming: RisuPlugin): string[] {
    const liveRecord = live as unknown as Record<string, unknown>
    const incomingRecord = incoming as unknown as Record<string, unknown>
    const keys = new Set([...Object.keys(liveRecord), ...Object.keys(incomingRecord)])
    keys.delete('script')
    return [...keys].filter((key) => !valuesEqual(liveRecord[key], incomingRecord[key]))
}

/**
 * Sorts the entries of an incoming plugin list against the installed list, by
 * name. Nothing is changed.
 *
 * - An entry that is malformed, repeats an earlier name, has the installed
 *   script, or has an installed name with a script whose header version is not
 *   strictly newer than the installed one, is ignored.
 * - An entry with an installed name and a different script whose header parses,
 *   names the same plugin, declares API 3.0 and has a strictly newer version is
 *   an update.
 * - An entry with a name that is not installed is an install when its header
 *   parses, names the entry and declares API 3.0.
 * - A header that does not parse, names another plugin or declares another API
 *   is a refusal, whatever the version.
 *
 * Details of updates and installs come from the new script's header, never from
 * the other fields of the incoming entry.
 */
export function classifyPluginList(live: readonly RisuPlugin[], incoming: readonly unknown[]): PluginListClassification {
    const result: PluginListClassification = { ignored: [], updates: [], installs: [], refused: [] }
    const installed = new Map<string, RisuPlugin>()
    for (const plugin of live) {
        if (typeof plugin?.name === 'string' && !installed.has(plugin.name)) {
            installed.set(plugin.name, plugin)
        }
    }
    const seen = new Set<string>()

    for (let index = 0; index < incoming.length; index++) {
        const raw = incoming[index] as Partial<RisuPlugin> | null | undefined
        if (typeof raw !== 'object' || raw === null || typeof raw.name !== 'string' || typeof raw.script !== 'string') {
            result.ignored.push({
                index,
                kind: 'malformed',
                name: typeof raw?.name === 'string' ? raw.name : undefined,
                warning: `entry ${index} has no string name or no string script and was ignored.`,
            })
            continue
        }
        const name = raw.name
        const script = raw.script
        if (seen.has(name)) {
            result.ignored.push({ index, kind: 'duplicate-name', name, warning: `"${name}" appears more than once in the list; only its first entry counts and entry ${index} was ignored.` })
            continue
        }
        seen.add(name)

        const installedEntry = installed.get(name)
        if (installedEntry !== undefined && installedEntry.script === script) {
            const differing = differingFields(installedEntry, raw as RisuPlugin)
            result.ignored.push({
                index,
                kind: 'same-script',
                name,
                warning: differing.length === 0
                    ? null
                    : `"${name}" was sent with its installed script but other fields changed (${differing.join(', ')}); the entry was ignored. A plugin changes its own arguments through setArgument.`,
            })
            continue
        }

        const header = parsePluginHeader(script)
        if ('error' in header) {
            result.refused.push({ index, name, reason: header.error })
            continue
        }
        if (header.name !== name) {
            result.refused.push({ index, name, reason: `the script header names "${header.name}", not "${name}"` })
            continue
        }
        const apiRefusal = apiVersionRefusal(header.apiVersion)
        if (apiRefusal !== null) {
            result.refused.push({ index, name, reason: apiRefusal })
            continue
        }

        if (installedEntry === undefined) {
            result.installs.push({ index, name, entry: pluginEntryFromHeader(script, header) })
            continue
        }

        const installedVersion: unknown = installedEntry.versionOfPlugin
        if (!isUsableVersion(installedVersion) || !isUsableVersion(header.versionOfPlugin) || compareVersions(header.versionOfPlugin, installedVersion) !== 1) {
            result.ignored.push({
                index,
                kind: 'not-newer',
                name,
                installedVersion: isUsableVersion(installedVersion) ? installedVersion.trim() : undefined,
                incomingVersion: header.versionOfPlugin,
                warning: `"${name}" was sent with a script whose version (${isUsableVersion(header.versionOfPlugin) ? header.versionOfPlugin : 'no version'}) is not newer than the installed version (${isUsableVersion(installedVersion) ? installedVersion.trim() : 'no version'}); the entry was ignored.`,
            })
            continue
        }

        result.updates.push({
            index,
            name,
            entry: pluginEntryFromHeader(script, header),
            baseScript: installedEntry.script,
            fromVersion: installedVersion.trim(),
            toVersion: header.versionOfPlugin,
        })
    }

    return result
}

//#endregion

//#region applying

export interface PluginApplyProblem {
    name: string
    kind: 'update' | 'install'
    /** What happened to the list since the change was classified. */
    reason: 'removed' | 'replaced' | 'taken'
}

export interface PluginApplyFailure {
    failed: PluginApplyProblem[]
}

/**
 * The installed list with the accepted updates and installs applied, as a new
 * array; `live` is not changed. Run it against the list as it is at the moment
 * of the write, in the same synchronous step as the assignment.
 *
 * - An update replaces its entry in place. Its saved values and on/off state
 *   come from the entry in `live`, not from anything read earlier.
 * - Installs are appended in incoming order.
 * - Every plugin in `live` that no change names stays, and a plugin that is
 *   absent from `live` is not brought back.
 * - A change that cannot be applied fails the whole call: an update whose
 *   target is gone or whose script differs from the one it was classified
 *   against, or an install whose name is now taken.
 */
export function applyPluginChanges(live: readonly RisuPlugin[], accepted: Pick<PluginListClassification, 'updates' | 'installs'>): RisuPlugin[] | PluginApplyFailure {
    const failed: PluginApplyProblem[] = []
    const updatesByName = new Map<string, PluginUpdateChange>()
    for (const update of accepted.updates) {
        const target = live.find((plugin) => plugin.name === update.name)
        if (target === undefined) {
            failed.push({ name: update.name, kind: 'update', reason: 'removed' })
        } else if (target.script !== update.baseScript) {
            failed.push({ name: update.name, kind: 'update', reason: 'replaced' })
        } else {
            updatesByName.set(update.name, update)
        }
    }
    for (const install of accepted.installs) {
        if (live.some((plugin) => plugin.name === install.name)) {
            failed.push({ name: install.name, kind: 'install', reason: 'taken' })
        }
    }
    if (failed.length > 0) {
        return { failed }
    }

    const next = live.map((plugin) => {
        const update = updatesByName.get(plugin.name)
        return update === undefined ? plugin : carrySavedValues(plugin, update.entry)
    })
    for (const install of accepted.installs) {
        next.push(install.entry)
    }
    return next
}

//#endregion
