/**
 * CHORE-17 follow-up harness stub for `src/ts/gui/colorscheme.ts`.
 *
 * `database.svelte.ts` imports only `defaultColorScheme` (a value) and
 * `ColorScheme` (a type, erased at build) from this module. The real
 * `colorscheme.ts` itself imports `globalApi.svelte`, `util.ts`, `alert.ts`,
 * `lite.ts` and `stores.svelte.ts` -- all DOM/theme-application plumbing
 * unrelated to the setDatabase/registerDbChangeEffects path this harness
 * measures, so it is stubbed as a whole rather than partially unwound.
 * Value copied verbatim from the real file (read at the time this was
 * written) since `setDatabase()`'s default-fill for `data.colorScheme`
 * assigns this object, and having a structurally real value (not `{}`)
 * avoids a spurious "always different from itself" comparison anywhere else
 * that touches it.
 */
export const defaultColorScheme = {
    bgcolor: '#282a36',
    darkbg: '#21222c',
    borderc: '#6272a4',
    selected: '#44475a',
    draculared: '#ff5555',
    textcolor: '#f8f8f2',
    textcolor2: '#64748b',
    darkBorderc: '#4b5563',
    darkbutton: '#374151',
    type: 'dark',
}

export function updateColorScheme(): void {}
export function updateTextThemeAndCSS(): void {}
