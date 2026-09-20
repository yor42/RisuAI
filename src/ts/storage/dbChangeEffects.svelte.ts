import { DBState, selectedCharID } from "../stores.svelte"
import type { toSaveType } from "./risuSave"

export interface DbChangeEffectOptions {
    tracker: toSaveType
    /** Called by every effect. `markDirty` is false on an effect's first run. */
    markChanged: (markDirty: boolean) => void
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
    let ranOnce2 = false
    $effect(() => {
        $state.snapshot(DBState.db.modules)
        opts.tracker.modules = true
        opts.markChanged(ranOnce2)
        ranOnce2 = true
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
}
