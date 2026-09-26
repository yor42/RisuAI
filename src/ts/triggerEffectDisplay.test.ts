import { describe, test, expect, vi } from 'vitest'

// triggerEffectDisplay.ts's only runtime dependency outside `src/lang` is
// `src/ts/process/triggers`, imported only for `displayAllowList` and
// `requestAllowList` (its other imports from that module are types, erased
// at compile time). The real triggers.ts re-exports the full app dependency
// graph (database.svelte, modules.ts, stores.svelte's `$effect`s, Tauri
// plugins, ...); importing it for real from a plain unit test crashes on a
// TDZ error inside a `$effect` that assumes the app has already booted
// (verified directly: `ReferenceError: Cannot access '__vite_ssr_import_17__'
// before initialization` in `getDatabase` via `stores.svelte.ts`'s module
// effect). Replacing it with a minimal stand-in, matching the mocking
// pattern in `src/ts/storage/tests/dbChangeEffects.svelte.test.ts` and
// `src/ts/process/mcp/risuaccess/tests/modules.test.ts`, avoids that
// entirely. The two lists below are deliberately NOT copied from the real
// module -- checkSupported's contract is what is under test here, not
// today's list contents, so keeping them independent of the production
// lists avoids the tests going stale (or silently losing coverage) as those
// lists grow.
vi.mock(import('./process/triggers'), () => ({
    displayAllowList: ['v2GetDisplayState', 'v2SetDisplayState'],
    requestAllowList: ['v2GetRequestState'],
}) as any)

import type { triggerEffect, triggerscript } from './process/triggers'
import {
    checkSupported,
    escapeHtml,
    formatEffectDisplay,
    formatEffectLabel,
    safeIndent,
    type EffectSupportContext,
} from './triggerEffectDisplay'

// The payload used throughout: a classic stored-XSS shape, matching the
// defect this module guards against (an imported character card's
// triggerscript JSON carrying arbitrary markup into an app-authored
// `{@html}` span). Most of the `formatEffectDisplay` tests below that use
// this payload assert the SAME two things: the raw payload's opening tag
// never appears verbatim in the output, and its escaped form does -- not
// every test in the file uses it this way, since a few (the unsupported-
// effect case, the `margin-left` style test, and the template-text-stays-
// unescaped case) are pinning a different property entirely.
const HOSTILE = '<img src=x onerror=alert(1)>'
const HOSTILE_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;'

// A second payload, used only for the value-typed branch (the one that
// wraps its hole in literal double quotes), to also confirm the quote
// character itself is escaped and cannot break out of that quoting.
const HOSTILE_QUOTE = '"><script>alert(1)</script>'
const HOSTILE_QUOTE_ESCAPED = '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;'

// Shared context for every formatEffectDisplay/formatEffectLabel branch
// test: a trigger of type 'start' (neither 'display' nor 'request'), with
// no special/low-level restrictions and lowLevelAble true, so
// checkSupported(effect.type, ...) is true unconditionally regardless of
// which effect type a given test constructs. Tests of checkSupported itself
// (below) build their own contexts to exercise its other branches.
function supportedContext(): EffectSupportContext {
    const trigger: triggerscript = { comment: '', type: 'start', conditions: [], effect: [] }
    return {
        value: [trigger],
        selectedIndex: 0,
        lowLevelAble: true,
        specialEffects: [],
        lowLevelEffects: [],
    }
}

describe('escapeHtml', () => {
    test('escapes &', () => {
        expect(escapeHtml('&')).toBe('&amp;')
    })

    test('escapes <', () => {
        expect(escapeHtml('<')).toBe('&lt;')
    })

    test('escapes >', () => {
        expect(escapeHtml('>')).toBe('&gt;')
    })

    test('escapes "', () => {
        expect(escapeHtml('"')).toBe('&quot;')
    })

    test("escapes '", () => {
        expect(escapeHtml("'")).toBe('&#39;')
    })

    test('escapes all five characters together, each independently', () => {
        expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
    })

    test('a full XSS-shaped payload comes out with no raw angle bracket', () => {
        const result = escapeHtml(HOSTILE)
        expect(result).toBe(HOSTILE_ESCAPED)
        expect(result).not.toContain('<')
        expect(result).not.toContain('>')
    })

    // `effect[field]` is unvalidated imported JSON: it can be any JS value,
    // not just a string. None of these should throw.
    test('a number is stringified, not thrown on', () => {
        expect(() => escapeHtml(42)).not.toThrow()
        expect(escapeHtml(42)).toBe('42')
    })

    test('null is stringified to the literal text "null"', () => {
        expect(escapeHtml(null)).toBe('null')
    })

    test('undefined is stringified to the literal text "undefined"', () => {
        expect(escapeHtml(undefined)).toBe('undefined')
    })

    test('a boolean is stringified, not thrown on', () => {
        expect(escapeHtml(true)).toBe('true')
        expect(escapeHtml(false)).toBe('false')
    })

    test('a plain object does not throw, and stringifies via its default toString', () => {
        expect(() => escapeHtml({})).not.toThrow()
        expect(escapeHtml({})).toBe('[object Object]')
    })

    test('an array is stringified via its default join, then escaped', () => {
        expect(escapeHtml([1, 2])).toBe('1,2')
    })

    test('an array containing markup is stringified first, then the markup is escaped', () => {
        expect(escapeHtml(['<b>'])).toBe('&lt;b&gt;')
    })

    // Documented actual behaviour, not assumed: escapeHtml has no notion of
    // "already escaped" input. An input that already contains a literal
    // `&amp;` has its `&` escaped again, producing `&amp;amp;` -- a single
    // pass over already-escaped text double-encodes it. This is not
    // exercised as a defect here: every call site in this module escapes a
    // raw `effect[field]` value exactly once, never re-escapes its own
    // output, so this behaviour is simply what the function does, not a bug
    // this test is asserting against.
    test('an already-escaped &amp; is escaped again, not left alone (documented actual behaviour)', () => {
        expect(escapeHtml('&amp;')).toBe('&amp;amp;')
    })
})

describe('safeIndent', () => {
    test('a plain number passes through unchanged', () => {
        expect(safeIndent(2)).toBe(2)
    })

    test('a numeric string is coerced to a number', () => {
        expect(safeIndent('3')).toBe(3)
    })

    test('a non-numeric string falls back to 0', () => {
        expect(safeIndent('abc')).toBe(0)
    })

    test('NaN falls back to 0', () => {
        expect(safeIndent(NaN)).toBe(0)
    })

    test('Infinity falls back to 0 (not finite)', () => {
        expect(safeIndent(Infinity)).toBe(0)
        expect(safeIndent(-Infinity)).toBe(0)
    })

    test('null coerces to 0 via Number(null), which is itself finite', () => {
        // Number(null) is 0, which IS finite, so this returns 0 via the
        // normal numeric path, not the NaN fallback. Documented so the
        // "both branches happen to agree" coincidence is not mistaken for
        // proof that the fallback branch ran.
        expect(safeIndent(null)).toBe(0)
    })

    test('undefined falls back to 0 (Number(undefined) is NaN)', () => {
        expect(safeIndent(undefined)).toBe(0)
    })

    test('a negative finite number is preserved, not clamped', () => {
        expect(safeIndent(-5)).toBe(-5)
    })

    // The point of safeIndent: it feeds a `style="margin-left:...rem"`
    // attribute, where HTML-escaping the string would do nothing to stop
    // CSS/attribute injection. A crafted, non-numeric indent must still
    // come out as a finite number (here, 0), not pass through as text.
    test('a CSS-injection-shaped indent yields a finite number, not the raw payload', () => {
        const result = safeIndent('0; background:url(x)')
        expect(Number.isFinite(result)).toBe(true)
        expect(result).toBe(0)
    })
})

describe('checkSupported', () => {
    test('false when value is empty', () => {
        const ctx = supportedContext()
        ctx.value = []
        expect(checkSupported('v2Comment', ctx)).toBe(false)
    })

    test('false when selectedIndex is negative', () => {
        const ctx = supportedContext()
        ctx.selectedIndex = -1
        expect(checkSupported('v2Comment', ctx)).toBe(false)
    })

    test('false when selectedIndex is past the end of value', () => {
        const ctx = supportedContext()
        ctx.selectedIndex = 5
        expect(checkSupported('v2Comment', ctx)).toBe(false)
    })

    test('display-type trigger: true only for names on displayAllowList', () => {
        const ctx = supportedContext()
        ctx.value = [{ comment: '', type: 'display', conditions: [], effect: [] }]
        expect(checkSupported('v2GetDisplayState', ctx)).toBe(true)
        expect(checkSupported('v2SetVar', ctx)).toBe(false)
    })

    test('request-type trigger: true only for names on requestAllowList', () => {
        const ctx = supportedContext()
        ctx.value = [{ comment: '', type: 'request', conditions: [], effect: [] }]
        expect(checkSupported('v2GetRequestState', ctx)).toBe(true)
        expect(checkSupported('v2SetVar', ctx)).toBe(false)
    })

    test('a name on specialEffects is never supported, regardless of lowLevelAble', () => {
        const ctx = supportedContext()
        ctx.specialEffects = ['v2Dangerous']
        ctx.lowLevelAble = true
        expect(checkSupported('v2Dangerous', ctx)).toBe(false)
    })

    test('lowLevelAble true allows a name that is not special and not on lowLevelEffects', () => {
        const ctx = supportedContext()
        ctx.lowLevelAble = true
        ctx.lowLevelEffects = ['v2LowLevelThing']
        expect(checkSupported('v2LowLevelThing', ctx)).toBe(true)
    })

    test('lowLevelAble false blocks a name on lowLevelEffects', () => {
        const ctx = supportedContext()
        ctx.lowLevelAble = false
        ctx.lowLevelEffects = ['v2LowLevelThing']
        expect(checkSupported('v2LowLevelThing', ctx)).toBe(false)
    })

    test('lowLevelAble false still allows a name that is not on lowLevelEffects', () => {
        const ctx = supportedContext()
        ctx.lowLevelAble = false
        ctx.lowLevelEffects = ['v2LowLevelThing']
        expect(checkSupported('v2OrdinaryThing', ctx)).toBe(true)
    })
})

describe('formatEffectDisplay: unsupported effect', () => {
    test('renders the app-authored unsupported span, untouched by escaping', () => {
        const ctx = supportedContext()
        ctx.lowLevelAble = false
        ctx.specialEffects = ['v2Comment']
        const effect = { type: 'v2Comment', value: 'irrelevant', indent: 0 } as unknown as triggerEffect

        expect(formatEffectDisplay(effect, ctx)).toBe('<span class="text-red-500">Unsupported Trigger</span>')
    })
})

// This suite covers escaping across the template's `{{hole}}` interpolation
// branches -- the ones inside the callback passed to
// `.replace(/{{(.+?)}}/g, ...)`. It does NOT cover the template lookup's own
// fallback (`language.triggerDesc[type + 'Desc'] as string || escapeHtml(type)`),
// which is a separate branch with its own describe below. A suite once
// named "escaping holds in every branch" implied that fallback was covered
// too; it was not, the fallback was unescaped, and a hostile `type` reached
// `{@html}` verbatim through it -- a live stored-XSS path, not a
// hypothetical one. See `Agents/Live-State.md`, "Current work: the
// home-screen rework," Stage 1. Each test below drives the SAME hostile
// payload through a different interpolation branch and asserts the same two
// things: no raw `<img` from the payload, and its escaped form present
// instead.
describe('formatEffectDisplay: {{hole}} interpolation escaping, branch by branch', () => {
    test('v2Comment / value branch', () => {
        const ctx = supportedContext()
        const effect = { type: 'v2Comment', value: HOSTILE, indent: 0 } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    // This cannot by itself distinguish `d ? 'true' : 'false'` from plain
    // `String(d)`, because `String(true)` is ALSO the string "true". It only
    // pins that a `true` boolean field renders as the word "true" wrapped in
    // the expected span, not the raw boolean or "1".
    test('boolean branch renders "true" for a true field (does not distinguish the ternary from String(d))', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetLorebookActivation',
            index: '0',
            indexType: 'value',
            value: true,
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).toContain('<span class="text-blue-500">true</span>')
    })

    test('...Type-suffix branch (e.g. regexType)', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2ExtractRegex',
            value: 'x', valueType: 'value',
            regex: 'y', regexType: HOSTILE,
            flags: 'g', flagsType: 'value',
            result: 'r', resultType: 'value',
            outputVar: 'v',
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    test('condition branch (v2If)', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2If',
            condition: HOSTILE,
            targetType: 'value', target: 't',
            source: 's',
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    test('operator branch (v2SetVar)', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetVar',
            operator: HOSTILE,
            var: 'x',
            valueType: 'value', value: 'safe',
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    test('var-typed branch (effect[p1 + "Type"] === "var")', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetVar',
            operator: '=',
            var: 'x',
            valueType: 'var', value: HOSTILE,
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    test('value-typed branch (effect[p1 + "Type"] === "value"), including the surrounding quotes', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetVar',
            operator: '=',
            var: 'x',
            valueType: 'value', value: HOSTILE_QUOTE,
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<script>')
        expect(result).toContain(HOSTILE_QUOTE_ESCAPED)
    })

    test('v2If / source branch', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2If',
            condition: '=',
            targetType: 'value', target: 't',
            source: HOSTILE,
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    test('v2SetVar / var branch', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetVar',
            operator: '=',
            var: HOSTILE,
            valueType: 'value', value: 'safe',
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    test('v2DeclareLocalVar / var branch', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2DeclareLocalVar',
            var: HOSTILE,
            valueType: 'value', value: 'safe',
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })

    test('default fallback branch (e.g. outputVar, an unTyped field)', () => {
        const ctx = supportedContext()
        const effect = { type: 'v2GetLastMessage', outputVar: HOSTILE, indent: 0 } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })
})

// The type-fallback branch:
// `language.triggerDesc[type + 'Desc'] as string || escapeHtml(type)`. When
// a trigger's effect type is not a name this app recognises (an imported
// character card's own triggerscript JSON, unvalidated at runtime), the
// lookup is `undefined` and the expression falls back to the raw,
// card-controlled `type` string itself -- not one of the `{{hole}}` values
// covered above. Before remediation this fallback read `|| type`,
// unescaped, and `checkSupported` does not gate on the effect name being
// known: an unrecognised name is always "supported" for a trigger whose own
// type is neither 'display' nor 'request'. So a hostile `type` reached
// `{@html}` verbatim -- a live stored-XSS path, and a strictly EASIER one to
// reach than every branch above, since it needs no field-name match at all,
// only an unrecognised `type`. See `Agents/Live-State.md`, "Current work:
// the home-screen rework," Stage 1.
describe('formatEffectDisplay: unrecognised effect type (the template fallback branch)', () => {
    test('a hostile type falls back to its escaped form, not the raw string, in the {@html} output', () => {
        const ctx = supportedContext()
        const effect = { type: HOSTILE, indent: 0 } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).not.toContain('<img')
        expect(result).toContain(HOSTILE_ESCAPED)
    })
})

// The other half of the same property, and the reason the fallback above
// must escape only ITSELF, not the whole expression: a RECOGNISED type's
// template text is the app's own copy (`language.triggerDesc[...]`), never
// card-controlled, and must reach `{@html}` byte-for-byte. Escaping the
// WHOLE expression (template text included) would corrupt any template
// containing an HTML-special character. `v2SetLorebookActivationDesc`
// ("...index {{index}}'s activation state to...") has exactly such a
// character -- a literal apostrophe sitting in the template text, outside
// any `{{hole}}`; escaping the whole expression would turn it into `&#39;s`,
// which this test catches.
describe("formatEffectDisplay: a recognised type's template text stays unescaped", () => {
    test("the literal apostrophe in v2SetLorebookActivationDesc survives untouched, only the holes are escaped", () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetLorebookActivation',
            index: '0', indexType: 'value',
            value: false,
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).toContain(`</span>'s activation state to`)
        expect(result).not.toContain('&#39;')
    })
})

describe('formatEffectDisplay: v2Comment style="margin-left:..." path', () => {
    test('a hostile indent still produces a well-formed, finite style value', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2Comment',
            value: 'a safe comment',
            indent: '0; background:url(evil)',
        } as unknown as triggerEffect

        const result = formatEffectDisplay(effect, ctx)

        expect(result).toContain('style="margin-left:0rem; word-break: break-all; overflow-wrap: break-word;"')
        expect(result).not.toContain('background:url')
    })
})

// formatEffectDisplay's result is HTML; formatEffectLabel feeds a plain-text
// drag-image caption (assigned as textContent in the component), so it must
// never contain markup, AND must never leak a literal HTML entity like
// "&lt;" as text -- the specific regression this function exists to avoid
// (an earlier approach of stripping tags out of formatEffectDisplay's
// already-escaped HTML would show "&lt;" verbatim instead of "<").
describe('formatEffectLabel', () => {
    test('unsupported effect returns the plain unsupported text', () => {
        const ctx = supportedContext()
        ctx.lowLevelAble = false
        ctx.specialEffects = ['v2Comment']
        const effect = { type: 'v2Comment', value: 'irrelevant', indent: 0 } as unknown as triggerEffect

        expect(formatEffectLabel(effect, ctx)).toBe('Unsupported Trigger')
    })

    test('v2Comment is prefixed with "// ", as plain text', () => {
        const ctx = supportedContext()
        const effect = { type: 'v2Comment', value: 'hello world', indent: 0 } as unknown as triggerEffect

        expect(formatEffectLabel(effect, ctx)).toBe('// hello world')
    })

    // v2Comment's `{{value}}` hole has its own dedicated branch (`type ===
    // 'v2Comment' && p1 === 'value'`) specifically so a falsy value renders
    // as an empty string, not the generic `String(d || 'null')` fallback
    // every other hole uses. An empty comment must therefore caption "// ",
    // not "// null".
    test('an empty v2Comment value captions "// ", not the generic "null" fallback', () => {
        const ctx = supportedContext()
        const effect = { type: 'v2Comment', value: '', indent: 0 } as unknown as triggerEffect

        expect(formatEffectLabel(effect, ctx)).toBe('// ')
    })

    test('a boolean field renders the literal word', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetLorebookActivation',
            index: '0', indexType: 'value',
            value: true,
            indent: 0,
        } as unknown as triggerEffect

        expect(formatEffectLabel(effect, ctx)).toBe(`Set Lorebook with index "0"'s activation state to true`)
    })

    // The security-relevant assertion: a hostile payload comes through as
    // literal, raw text -- no markup wrapper (this is plain text, not
    // {@html}), and critically, no "&lt;"-style entity leaking through
    // where the raw "<" belongs.
    test('a hostile payload is returned raw, with no HTML entity leaking through as text', () => {
        const ctx = supportedContext()
        const effect = { type: 'v2GetLastMessage', outputVar: HOSTILE, indent: 0 } as unknown as triggerEffect

        const result = formatEffectLabel(effect, ctx)

        expect(result).toContain(HOSTILE)
        expect(result).not.toContain('&lt;')
        expect(result).not.toContain('&gt;')
    })

    // formatEffectDisplay's `type` fallback must be escaped (see the
    // "template fallback branch" describe above); this function's matching
    // fallback must NOT be, because it feeds `textContent` (the drag-image
    // caption), not `{@html}`. Pinning this raw, un-entitied output stops a
    // future reader "fixing" the two functions identically and making this
    // caption leak literal `&lt;`/`&gt;` to a user who never typed them.
    test('an unrecognised type falls back to the raw type string verbatim, with no entities', () => {
        const ctx = supportedContext()
        const effect = { type: HOSTILE, indent: 0 } as unknown as triggerEffect

        const result = formatEffectLabel(effect, ctx)

        expect(result).toBe(HOSTILE)
        expect(result).not.toContain('&lt;')
        expect(result).not.toContain('&gt;')
    })

    test('a value-typed field is quoted but not escaped', () => {
        const ctx = supportedContext()
        const effect = {
            type: 'v2SetVar',
            operator: '=',
            var: 'x',
            valueType: 'value', value: HOSTILE_QUOTE,
            indent: 0,
        } as unknown as triggerEffect

        const result = formatEffectLabel(effect, ctx)

        expect(result).toContain(`"${HOSTILE_QUOTE}"`)
        expect(result).not.toContain('&quot;')
    })
})
