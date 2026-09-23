import { language } from "src/lang";
import { type triggerEffect, type triggerEffectV2, type triggerscript, displayAllowList, requestAllowList } from "src/ts/process/triggers";

/**
 * Runtime state `checkSupported` and the trigger-effect formatters need in order to decide
 * whether a given effect type is available for the currently selected trigger. This mirrors
 * the component-local state (`value`, `selectedIndex`, `lowLevelAble`) that
 * `TriggerV2List.svelte` already owns, plus the two effect-name lists it reads out of its own
 * `effectCategories` menu data (`effectCategories['Special']` and `effectCategories['Low
 * Level']`). That categorisation data stays in the component, since it is UI-menu structure,
 * not display-formatting logic.
 */
export interface EffectSupportContext {
    value: triggerscript[]
    selectedIndex: number
    lowLevelAble: boolean
    specialEffects: string[]
    lowLevelEffects: string[]
}

export const checkSupported = (effectName: string, context: EffectSupportContext): boolean => {
    const { value, selectedIndex, lowLevelAble, specialEffects, lowLevelEffects } = context
    if(!value || value.length === 0 || selectedIndex < 0 || selectedIndex >= value.length || !value[selectedIndex]){
        return false
    }
    if(value[selectedIndex].type === 'display'){
        return displayAllowList.includes(effectName)
    }
    if(value[selectedIndex].type === 'request'){
        return requestAllowList.includes(effectName)
    }
    if(specialEffects.includes(effectName)){
        return false
    }

    if(lowLevelAble){
        return true
    }
    return !lowLevelEffects.includes(effectName)
}

// Character cards can carry arbitrary strings in trigger-effect fields (imported, not
// authored in this app), and formatEffectDisplay renders its result with {@html}. Every
// value pulled from `effect[...]` below is untrusted and must be escaped before it is
// placed inside the app-authored markup. The template string itself
// (`language.triggerDesc[type + 'Desc']`) is the app's own text and is never escaped —
// but formatEffectDisplay's fallback for an unrecognised `type` is the raw, card-controlled
// `type` string, not app text, so that fallback specifically must be escaped too. See the
// escaping of the template expression's fallback branch below.
export const escapeHtml = (value: unknown): string => {
    return String(value).replace(/[&<>"']/g, (char) => {
        switch(char){
            case '&': return '&amp;'
            case '<': return '&lt;'
            case '>': return '&gt;'
            case '"': return '&quot;'
            case "'": return '&#39;'
            default: return char
        }
    })
}

// `indent` is typed as `number`, but that type is compile-time only: an imported character
// card's triggerscript JSON is never validated at runtime, so a crafted card can still hand
// this a non-numeric string. It is interpolated into a `style` attribute, where HTML-escaping
// alone would not stop CSS/attribute injection, so it is coerced to a finite number instead.
export const safeIndent = (indent: unknown): number => {
    const n = Number(indent)
    return Number.isFinite(n) ? n : 0
}

export const formatEffectDisplay = (effect: triggerEffect, context: EffectSupportContext): string => {
    const type = effect.type

    if(!checkSupported(type, context)){
        return `<span class="text-red-500">${language.triggerDesc.v2UnsupportedTriggerDesc}</span>`
    }

    // The template half of this expression (`language.triggerDesc[type + 'Desc']`) is
    // app-authored text and must stay unescaped. The fallback half (`type`) is not: it is
    // the raw, card-controlled effect-type string, used verbatim whenever the card names an
    // effect this app does not recognise. `checkSupported` does not gate on effect names
    // being known, so an unrecognised `type` reaches here. escapeHtml on just the fallback
    // keeps the two halves' trust levels distinct instead of escaping (or not escaping) both
    // alike.
    const txt = (language.triggerDesc[type + 'Desc'] as string || escapeHtml(type)).replace(/{{(.+?)}}/g, (match, p1) => {
        const d = effect[p1]

        if(type === 'v2Comment' && p1 === 'value') {
            return `<span class="text-gray-400">${escapeHtml(d || '')}</span>`
        }

        if(typeof d === 'boolean'){
            return `<span class="text-blue-500">${d ? 'true' : 'false'}</span>`
        }

        if(p1.endsWith('Type')){
            return `<span class="text-blue-500">${escapeHtml(d || 'null')}</span>`
        }
        if(p1 === 'condition' || p1 === 'operator'){
            return `<span class="text-green-500">${escapeHtml(d || 'null')}</span>`
        }
        if(effect[p1 + 'Type'] === 'var'){
            return `<span class="text-yellow-500">${escapeHtml(d || 'null')}</span>`
        }
        if(effect[p1 + 'Type'] === 'value'){
            return `<span class="text-green-500">"${escapeHtml(d)}"</span>`
        }
        if(effect.type === 'v2If' && p1 === 'source'){
            return `<span class="text-yellow-500">${escapeHtml(d || 'null')}</span>`
        }
        if(effect.type === 'v2SetVar' && p1 === 'var'){
            return `<span class="text-yellow-500">${escapeHtml(d || 'null')}</span>`
        }
        if(effect.type === 'v2DeclareLocalVar' && p1 === 'var'){
            return `<span class="text-cyan-500">${escapeHtml(d || 'null')}</span>`
        }
        return `<span class="text-blue-500">${escapeHtml(d || 'null')}</span>`
    })

    if(type === 'v2Comment') {
        return `<div class="text-gray-500 italic line-clamp-4" style="margin-left:${safeIndent((effect as triggerEffectV2).indent)}rem; word-break: break-all; overflow-wrap: break-word;">// ${txt}</div>`
    }

    return `<div class="text-purple-500 line-clamp-4" style="margin-left:${safeIndent((effect as triggerEffectV2).indent)}rem; word-break: break-all; overflow-wrap: break-word;">${txt}</div>`
}

// formatEffectDisplay's result is HTML; a plain-text label (used for the drag-image caption)
// has to be built from the same raw values rather than by stripping tags out of the escaped
// HTML, or it would show literal entities like "&lt;" once the holes above are escaped.
//
// The `type` fallback below is the same raw, card-controlled string formatEffectDisplay
// must escape, but this function feeds `textContent` (the drag-image caption), not
// `{@html}`, so a value placed here can never be parsed as markup. Do NOT wrap this
// fallback in escapeHtml() — doing so would print literal entities like "&lt;" in the
// caption a user actually reads, for no security benefit.
export const formatEffectLabel = (effect: triggerEffect, context: EffectSupportContext): string => {
    const type = effect.type

    if(!checkSupported(type, context)){
        return String(language.triggerDesc.v2UnsupportedTriggerDesc)
    }

    const txt = (language.triggerDesc[type + 'Desc'] as string || type).replace(/{{(.+?)}}/g, (match, p1) => {
        const d = effect[p1]

        if(type === 'v2Comment' && p1 === 'value') {
            return String(d || '')
        }

        if(typeof d === 'boolean'){
            return d ? 'true' : 'false'
        }
        if(effect[p1 + 'Type'] === 'value'){
            // No `??` fallback here: this mirrors formatEffectDisplay's matching branch,
            // which plainly stringifies `d`, and preserves the pre-extraction behaviour of
            // rendering the literal word "undefined" for an undefined value-typed field.
            return `"${d}"`
        }
        // `||`, not `??`: preserves the pre-extraction behaviour where an empty string
        // (falsy) also falls back to the literal word "null", not just null/undefined.
        return String(d || 'null')
    })

    return type === 'v2Comment' ? `// ${txt}` : txt
}
