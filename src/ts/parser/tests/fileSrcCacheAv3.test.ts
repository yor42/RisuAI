/**
 * AV-3 (Report 15, `Agents/Reports/15-av3-plain-http-encode-plan.md` §4):
 * T9/T10, the parser side of the plan (the `getFileSrcCached` function in
 * `src/ts/parser/parser.svelte.ts`, real, unmocked, driven through the
 * exported `ParseMarkdown`). T1-T8/T11-T13 (the `globalApi.svelte.ts` side)
 * live in `src/ts/globalApiFileCacheAv3.svelte.test.ts` instead, because
 * that side needs the REAL `getFileSrc`/`fileCache`, while this side needs
 * `getFileSrc` (and the new `isPlainHttpFileSrc` predicate) mocked, so the
 * test can pick which branch `getFileSrcCached` is meant to be taking
 * without depending on globalApi.svelte.ts's own internals.
 *
 * The AV-3 behaviour (Report 15 §2.2) has landed in `parser.svelte.ts`'s
 * `getFileSrcCached`; every test below passes against it.
 *
 * Mock set for `../parser.svelte`'s own dependencies is copied, one-for-one,
 * from `trimMarkdownStyle.test.ts` (already proven to load `parser.svelte.ts`
 * for real and drive `ParseMarkdown` end to end), extended only with
 * `getCurrentChat`/`modules` (needed once a real `character`-typed `char` is
 * passed in, which pulls in `getModuleAssets()` -> `getModules()` --
 * `trimMarkdownStyle.test.ts` never exercises that path because its `char`
 * argument is always `null`).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { writable } from 'svelte/store'
import { ParseMarkdown, resetAssetsCache } from '../parser.svelte'

//#region module mocks

vi.mock(
  import('../../storage/database.svelte'),
  () =>
    ({
      appVer: '1234.5.67',
      // Deliberately minimal, matching trimMarkdownStyle.test.ts's convention.
      // `processScriptFull`'s `runTrigger` call reads more off this than these
      // tests care to shape, but that call is wrapped in its own try/catch
      // (scripts.ts:105-116) -- it logs a harmless console.error, caught, not
      // thrown, and doesn't affect what these tests assert.
      getCurrentCharacter: () => ({}),
      getCurrentChat: () => ({}),
      getDatabase: () => ({ modules: [], enabledModules: [] }),
    } as typeof import('../../storage/database.svelte'))
)

vi.mock(import('../../globalApi.svelte'), () => ({
  aiWatermarkingLawApplies: () => false,
  getFileSrc: vi.fn(),
  // Mocked so each test can pick which branch getFileSrcCached takes,
  // independent of globalApi.svelte.ts's own isPlainHttpFileSrc logic
  // (which is covered directly by globalApiFileCacheAv3.svelte.test.ts's T11).
  isPlainHttpFileSrc: vi.fn(() => false),
  setUsingSw: vi.fn(),
  // AV-4 (Report 16 §4): avatarThumb.ts imports readImage eagerly at module
  // load, through characters.ts's own import graph.
  readImage: vi.fn(),
}))

vi.mock(import('../../stores.svelte'), () => {
  return {
    DBState: {
      db: {
        characters: [
          {
            chatPage: 0,
            chats: [{}],
            defaultVariables: '',
          },
        ],
        globalChatVariables: {},
        templateDefaultVariables: '',
      },
    },
    selIdState: {
      selId: 0,
    },
    selectedCharID: writable(0),
  } as typeof import('../../stores.svelte')
})

//#endregion

import { getFileSrc, isPlainHttpFileSrc } from '../../globalApi.svelte'

function makeCharWithAsset(name: string, path: string) {
  return {
    type: 'character',
    chaId: `char-${name}`,
    additionalAssets: [[name, path, 'png']],
    emotionImages: [],
    customscript: [],
  } as unknown as Parameters<typeof ParseMarkdown>[1]
}

beforeEach(() => {
  vi.mocked(getFileSrc).mockReset()
  vi.mocked(isPlainHttpFileSrc).mockReset()
  vi.mocked(isPlainHttpFileSrc).mockReturnValue(false)
})

describe('AV-3 getFileSrcCached', () => {
  test('T9: on plain HTTP, rendering the same asset twice calls getFileSrc twice (no permanent copy)', async () => {
    const name = 't9asset'
    const path = 'some/t9-asset.png'
    // getFileSrcCached treats '' as a miss (its `if(cached)` check in
    // parser.svelte.ts is falsy for an empty string), so the mock must
    // return a non-empty string.
    vi.mocked(getFileSrc).mockResolvedValue('data:mock-src;t9')
    vi.mocked(isPlainHttpFileSrc).mockReturnValue(true)
    const char = makeCharWithAsset(name, path)
    resetAssetsCache((char as { additionalAssets: string[][] }).additionalAssets, [], [])

    await ParseMarkdown(`{{asset::${name}}}`, char, 'back')
    await ParseMarkdown(`{{asset::${name}}}`, char, 'back')

    expect(getFileSrc).toHaveBeenCalledTimes(2)
    expect(getFileSrc).toHaveBeenCalledWith(path)
  })

  test('T10 (guard): with usingSw on (not plain HTTP), the second render is served from fileSrcCache', async () => {
    const name = 't10asset'
    const path = 'some/t10-asset.png'
    vi.mocked(getFileSrc).mockResolvedValue('data:mock-src;t10')
    vi.mocked(isPlainHttpFileSrc).mockReturnValue(false)
    const char = makeCharWithAsset(name, path)
    resetAssetsCache((char as { additionalAssets: string[][] }).additionalAssets, [], [])

    await ParseMarkdown(`{{asset::${name}}}`, char, 'back')
    await ParseMarkdown(`{{asset::${name}}}`, char, 'back')

    expect(getFileSrc).toHaveBeenCalledTimes(1)
  })
})
