# Measuring the chat-switch GUI-pointer fan-out

Re-runnable procedure behind the numbers in `Agents/Reports/19-chat-list-window-plan.md` §8.5 and §9.3.
This is a **live-app measurement**, not a Node harness: it needs a real mounted chat window, so it runs
in the browser pane against the dev server. Recorded here so the figures can be reproduced or refuted
rather than taken on trust.

## Preconditions

- The dev server is running (the maintainer starts it; the pane tab is the app).
- The pane is **visible**. A hidden pane runs no `requestAnimationFrame`, so timings are meaningless.
- Best-case hardware caveat applies: the recorded numbers came from an i9-13900K dev build. Ratios
  transfer, absolute numbers do not.

## Importing the app's live modules

Vite serves these modules with an HMR query string. A bare `import('/src/ts/stores.svelte.ts')` creates a
**second module instance** whose `DBState.db` is empty — this silently produced wrong readings once. Always
resolve the URL the app actually loaded:

```js
const R = performance.getEntriesByType('resource').map(r => r.name)
const u = p => R.find(n => n.includes(p))
const stores = await import(u('/src/ts/stores.svelte.ts'))
```

## Fixture

A temporary character with two long chats. Build it through `createNewCharacter()`, and **delete it
through `removeChar(idx, name, 'permanentForce')`** — a bare `db.characters.splice` does not set
`requiresFullEncoderReload`, so the saver keeps the removed block and the character returns on reload.
Verify the deletion across a page reload before finishing.

```js
const ch = await import(u('/src/ts/characters.ts'))
const db = stores.DBState.db
const body = 'The quick brown fox jumps over the lazy dog. '.repeat(24).slice(0, 1024)
const mk = (n, tag) => Array.from({length: n}, (_, k) => ({
  role: (k % 2) ? 'char' : 'user',
  data: `[${tag}#${k}] ${body}`,
  chatId: `fixture-${tag}-${k}`,
  time: 1790000000000 + k,
}))
const idx = ch.createNewCharacter()
const c = db.characters[idx]
c.name = 'MEASURE-TEMP'
c.chats = [
  {message: mk(3000, 'A'), note: '', name: 'Chat A', localLore: []},
  {message: mk(3000, 'B'), note: '', name: 'Chat B', localLore: []},
]
c.chatPage = 0
stores.selectedCharID.set(idx)
```

## Growing the window to 600

`loadPages` is component-local, so drive it through the app's own seek path, which raises it to
`totalMessages - index + 5`:

```js
stores.ScrollToMessageStore.value = 3000 - 600 + 5   // => 600
await new Promise(r => setTimeout(r, 2600))
document.querySelector('.default-chat-screen').scrollTop = 0   // bottom, in flex-col-reverse
```

Confirm with `document.querySelectorAll('.chat-message-container').length === 600`.

**`flex-col-reverse` uses negative `scrollTop`** for older content in Chrome. Positive offsets silently do
nothing; a first attempt at the scroll-anchoring check measured nothing because of this.

## The measurement

Per trial: re-grow to 600, then time the switch as script (mutation plus `flushSync()`) and layout (a
forced `scrollHeight` read). Alternate variants rather than running each in a block, so drift affects all
of them equally.

```js
const { flushSync } = await import(u('/node_modules/.vite/deps/svelte.js'))
const api = await import(u('/src/ts/globalApi.svelte.ts'))
let cur = 0; stores.ReloadGUIPointer.subscribe(v => cur = v)

// today's chat-list click: changeChatTo, then SideChatList's own second bump
api.changeChatTo(target); stores.ReloadGUIPointer.set(cur + 1)

// the §9 proposal, simulated without editing source
db.characters[idx].chatPage = target; flushSync(); stores.ReloadGUIPointer.set(Math.random())

// the floor: no bump at all
db.characters[idx].chatPage = target
```

Each is followed by `flushSync()`, a `performance.now()` split, then `void scroller.scrollHeight` for the
layout half.

## Recorded results, 2026-09-23, 600 mounted

These are the **pre-change** figures plus the simulated proposal. The post-implementation run against the
real build is in Report 19 §9.3.1; to reproduce it, use the `changeChatTo` variant below against a build
that has the change, and reconstruct the old behaviour as `chatPage` write + two bumps with no flush.

| Variant | Median | Range | Trials |
|---|---|---|---|
| Chat-list click today | 102.4 ms | 97.6-105 | 4 |
| The same click under the §9 change | 71.1 ms | 62.2-76.1 | 4 |
| The §9 `changeChatTo` alone | 66.8 ms | 62.5-75.1 | 4 |
| `chatPage` set with no bump (floor) | 67.4 ms | 60.3-69.7 | 3 |

**Known limits.** Four trials per variant. One fixture shape (plain prose, no markdown or CBS — which
this save's own messages also are). One machine. The proposal was simulated in-page rather than by editing
source, so it pins the mechanism, not the shipped code; the post-implementation check should re-run the
first two rows against the real build. The DevTools Performance panel is not reachable from the pane, so
**paint is never separated** by this method — "layout" here means the forced style-and-layout pass only.

## Cleanup

```js
const i = db.characters.findIndex(c => c.name === 'MEASURE-TEMP')
if (i >= 0) await ch.removeChar(i, 'MEASURE-TEMP', 'permanentForce')
```

Then reload the page and confirm the character count is back to its original value and no fixture remains.
