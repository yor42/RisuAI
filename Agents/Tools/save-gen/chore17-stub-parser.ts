/**
 * CHORE-17 follow-up harness stub for `src/ts/parser/parser.svelte.ts`,
 * scoped to `stores.svelte.ts`'s own import of it.
 *
 * `stores.svelte.ts` writes `import { type simpleCharacterArgument } from
 * "./parser/parser.svelte"` -- a type-only specifier that should erase to
 * nothing at build time, but empirically does not here (the real
 * `parser.svelte.ts` still ends up in the bundle graph, ~900 modules,
 * pulling in `globalApi.svelte`'s and `util.ts`'s full export surfaces
 * transitively). `Agents/Tools/README.md` already documents this exact file
 * as a known problem for harnesses that mock sibling rune modules ("the
 * real, unmocked ... src/ts/parser/parser.svelte.ts ... fire their own
 * top-level $effect.root blocks"). Empty on purpose: nothing here imports a
 * runtime value from this module, only a type.
 */
export {}

export function hasher(s: string): string { return s }

export function applyMarkdownToNode(): void {}
export function risuChatParser(s: string): string { return s }

export const assetRegex = /(?!)/
export function risuEscape(s: string): string { return s }
export function risuUnescape(s: string): string { return s }

export function parseMarkdownSafe(s: string): string { return s }
