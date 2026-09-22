import { untrack } from "svelte"
import { DBState, selectedCharID } from "../stores.svelte"
import type { toSaveType } from "./risuSave"
import { appendIfAbsent } from "./characterSaveMarks"

export interface DbChangeEffectOptions {
    tracker: toSaveType
    /** Called by every effect. `markDirty` is false on an effect's first run. */
    markChanged: (markDirty: boolean) => void
    /**
     * Character proxies to seed the identity tracker's "already seen" set
     * with (Report 17 Stage 1 §3.2) -- normally the set `RisuSaveEncoder.init`
     * just encoded, so a replacement that happened WHILE that init was still
     * running isn't treated as new the first time the identity tracker below
     * runs. Without a seed (tests, or any other caller), the first run only
     * fills the set and marks nothing.
     */
    seed?: Iterable<object>
}

export function registerDbChangeEffects(opts: DbChangeEffectOptions): void {

    let selIdState = $state(0)

    selectedCharID.subscribe((v) => {
        selIdState = v
    })

    let ranOnce = false
    // Deep-read, like the sibling effects below. A shallow id/length read misses
    // every in-place preset mutation -- rename, preset image, and most importantly
    // saveCurrentPreset()'s `botPresets[id] = savedPreset` element write, whose
    // following `db.botPresets = pres` self-assignment notifies nothing. Since this
    // flag gates whether the preset block is re-encoded at all, a missed mutation is
    // never written to disk rather than merely written late.
    $effect(() => {
        $state.snapshot(DBState.db.botPresets)
        DBState.db.botPresetsId
        opts.tracker.botPreset = true
        opts.markChanged(ranOnce)
        ranOnce = true
    })
    let modulesRanOnce = false
    // Partitioned, not narrowed: an outer effect over array shape plus one child
    // effect per element, together registering the exact same dependency closure as
    // a single `$state.snapshot(DBState.db.modules)` (container, length, and every
    // index -- $state.snapshot's array branch never touches the array `version`
    // source). Reading less than this loses writes -- see the preset comment at
    // :19-24 for a real data-loss bug caused by exactly that. The point of splitting
    // it is that a leaf edit to module k now only re-reads module k's child effect,
    // not every other module's.
    //
    // Two independent guards, neither redundant:
    //   1. `opts.tracker.modules = true` is set unconditionally by the outer AND by
    //      every child, regardless of any `ranOnce` flag -- `risuSave.ts:328` gates
    //      on `tracker.modules`, not on `dirtySinceLastSave`. Do not delete the
    //      child's assignment as "redundant" with the outer's.
    //   2. `markChanged(false)` never marks clean: `saveTimeoutExecute`
    //      (`globalApi.svelte.ts:594-604`) only ever sets `dirtySinceLastSave = true`
    //      and re-arms the debounce timer.
    // Shape changes (push/splice/whole-array replacement) tear down and recreate
    // every child, so a recreated child's first run always passes `false` -- shape
    // changes are covered only by the outer's own `markChanged(modulesRanOnce)`,
    // which passes `true` on every run after its first.
    $effect(() => {
        const mods = DBState.db.modules
        const len = mods?.length ?? 0          // shape: push/splice/whole-array replacement
        for (let i = 0; i < len; i++) {
            const m = mods[i]                  // element identity: modules[i] = {...}
            if (!m) continue
            let childRanOnce = false
            $effect(() => {
                $state.snapshot(m)             // deep-read THIS element only
                opts.tracker.modules = true
                opts.markChanged(childRanOnce)
                childRanOnce = true
            })
        }
        opts.tracker.modules = true
        opts.markChanged(modulesRanOnce)
        modulesRanOnce = true
    })
    let ranOnce3 = false
    $effect(() => {
        $state.snapshot(DBState.db.loadouts)
        opts.tracker.loadouts = true
        opts.markChanged(ranOnce3)
        ranOnce3 = true
    })
    let ranOnce4 = false
    $effect(() => {
        $state.snapshot(DBState.db.plugins)
        opts.tracker.plugins = true
        opts.markChanged(ranOnce4)
        ranOnce4 = true
    })
    let ranOnce5 = false
    $effect(() => {
        $state.snapshot(DBState.db.pluginCustomStorage)
        opts.tracker.pluginCustomStorage = true
        opts.markChanged(ranOnce5)
        ranOnce5 = true
    })
    let ranOnce6 = false
    $effect(() => {
        for (const key in DBState.db) {
            if (
                key !== 'characters' && key !== 'botPresets' && key !== 'modules' &&
                key !== 'loadouts' && key !== 'plugins' && key !== 'pluginCustomStorage'
            ) {
                $state.snapshot(DBState.db[key])
            }
        }
        if (DBState?.db?.characters?.[selIdState]) {
            for (const key in DBState.db.characters[selIdState]) {
                if (key !== 'chats') {
                    $state.snapshot(DBState.db.characters[selIdState][key])
                }
            }
            $state.snapshot(DBState.db.characters[selIdState].chats)
            if (opts.tracker.character[0] !== DBState.db.characters[selIdState]?.chaId) {
                opts.tracker.character.unshift(DBState.db.characters[selIdState]?.chaId)
            }
            if (
                opts.tracker.chat[0]?.[0] !== DBState.db.characters[selIdState]?.chaId ||
                opts.tracker.chat[0]?.[1] !== DBState.db.characters[selIdState]?.chats[DBState.db.characters[selIdState]?.chatPage].id
            ) {
                opts.tracker.chat.unshift([DBState.db.characters[selIdState]?.chaId, DBState.db.characters[selIdState]?.chats[DBState.db.characters[selIdState]?.chatPage].id])
            }
        }
        opts.markChanged(ranOnce6)
        ranOnce6 = true
    })

    // Identity tracker (Report 17 Stage 1 §3.2): a SEPARATE effect that only
    // watches for a character being REPLACED (element or whole-array), not for
    // in-place field edits -- it reads DBState.db.characters, its length and
    // each chars[i], and no property of any element (chaId is read through
    // `untrack` below specifically so it never becomes a dependency; letting it
    // would make this effect re-run on a chaId edit, which never happens in
    // practice, but reading it untracked keeps the closure exactly "identity
    // only" as designed and verified against Svelte 5.55.1, plan §3.2).
    // Covers: V3 setCharacterToIndex, V3 setDatabase(Lite) with characters,
    // backup loads, and any future element/whole-db replacement -- writers this
    // plan's "option B" design (§2) does not otherwise see, because they never
    // touch the selected-character effect above. V2 in-place edits are NOT
    // seen by this identity tracker (they replace no element, so nothing here
    // fires) -- those are covered instead by the explicit marks the V2 plugin
    // setters make directly.
    //
    // Deliberately does NOT go through the module-global installed tracker
    // (characterSaveMarks.ts) -- it writes straight into opts.tracker with the
    // same `appendIfAbsent` rule `markCharacterForSave` uses, so tests stay
    // isolated from production installation state (re-review F7).
    let identityRanOnce = false
    const identitySeen = new WeakSet<object>(opts.seed ?? [])
    const identityHasSeed = !!opts.seed
    // The effect closures below all capture `opts` itself (they read
    // opts.tracker and call opts.markChanged), so as long as `opts.seed`
    // stayed populated on that same object, every character it references
    // would stay strongly reachable for as long as the effects live -- i.e.
    // forever, in production. `identitySeen` already copied everything it
    // needs out of `opts.seed` above, so release it here (Report 17 Stage 1,
    // second Gate 2 REJECT, item C).
    opts.seed = undefined
    $effect(() => {
        const chars = DBState.db.characters
        const len = chars?.length ?? 0
        for (let i = 0; i < len; i++) {
            const c = chars[i]
            if (!c) continue
            if (!identitySeen.has(c)) {
                // First run: only elements missing from the seed are "new" (a
                // replacement that raced encoder.init, plan §3.2 gate finding
                // 3). Without a seed, the first run only fills the set -- this
                // is what keeps the existing toHaveBeenCalledTimes(6) test
                // valid in Stage 1 (§4.3 updates it in Stage 2).
                if (identityRanOnce || identityHasSeed) {
                    const chaId = untrack(() => (c as { chaId?: string }).chaId)
                    if (chaId) {
                        appendIfAbsent(opts.tracker, chaId)
                        opts.markChanged(true)
                    }
                }
                identitySeen.add(c)
            }
        }
        identityRanOnce = true
    })
}
