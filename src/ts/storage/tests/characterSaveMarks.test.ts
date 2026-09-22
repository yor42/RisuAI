/**
 * Report 17 ("CHORE-01 + Phase 2 item 2") Stage 1, §3.1/§3.4 S6.
 *
 * Drives the real `src/ts/storage/characterSaveMarks.ts` module directly --
 * no mocks needed, since it only imports a *type* from `risuSave.ts` (erased
 * at runtime) and has no other dependency.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
    appendIfAbsent,
    installCharacterSaveMarks,
    markCharacterForSave,
    resetCharacterSaveMarksForTest,
    uninstallCharacterSaveMarks,
} from '../characterSaveMarks'
import type { toSaveType } from '../risuSave'

function makeTracker(character: string[] = []): toSaveType {
    return {
        character,
        chat: [],
        botPreset: false,
        modules: false,
        loadouts: false,
        plugins: false,
        pluginCustomStorage: false,
    }
}

afterEach(() => {
    resetCharacterSaveMarksForTest()
})

describe('appendIfAbsent', () => {
    test('appends an id not already present', () => {
        const tracker = makeTracker(['a'])
        appendIfAbsent(tracker, 'b')
        expect(tracker.character).toEqual(['a', 'b'])
    })

    test('is a no-op when the id is already present, at any position', () => {
        const tracker = makeTracker(['a', 'b', 'c'])
        appendIfAbsent(tracker, 'b')
        expect(tracker.character).toEqual(['a', 'b', 'c'])
    })

    test('appends to an empty tracker (becomes the only, and therefore front, entry)', () => {
        const tracker = makeTracker([])
        appendIfAbsent(tracker, 'x')
        expect(tracker.character).toEqual(['x'])
    })
})

describe('markCharacterForSave', () => {
    test('falsy or non-string ids are a no-op: does not touch the tracker or call schedule', () => {
        const tracker = makeTracker(['existing'])
        const schedule = vi.fn()
        installCharacterSaveMarks({ tracker, schedule })

        markCharacterForSave(undefined)
        markCharacterForSave(null)
        markCharacterForSave('')
        markCharacterForSave(0 as unknown as string)
        markCharacterForSave(123 as unknown as string)

        expect(tracker.character).toEqual(['existing'])
        expect(schedule).not.toHaveBeenCalled()
    })

    test('append-if-absent: marking an id already in the tracker does not duplicate it or move it', () => {
        const tracker = makeTracker(['front', 'existing'])
        const schedule = vi.fn()
        installCharacterSaveMarks({ tracker, schedule })

        markCharacterForSave('existing')

        expect(tracker.character).toEqual(['front', 'existing'])
        expect(schedule).toHaveBeenCalledTimes(1)
    })

    test('never displaces a non-empty character[0] (the sticky front)', () => {
        const tracker = makeTracker(['front'])
        const schedule = vi.fn()
        installCharacterSaveMarks({ tracker, schedule })

        markCharacterForSave('new-id')

        expect(tracker.character[0]).toBe('front')
        expect(tracker.character).toEqual(['front', 'new-id'])
    })

    test('Home case: becomes the front when the tracker is empty', () => {
        const tracker = makeTracker([])
        const schedule = vi.fn()
        installCharacterSaveMarks({ tracker, schedule })

        markCharacterForSave('home-char')

        expect(tracker.character).toEqual(['home-char'])
    })

    test('calls the installed schedule exactly once per mark that actually mutates or re-confirms the tracker', () => {
        const tracker = makeTracker([])
        const schedule = vi.fn()
        installCharacterSaveMarks({ tracker, schedule })

        markCharacterForSave('a')
        markCharacterForSave('b')

        expect(schedule).toHaveBeenCalledTimes(2)
    })

    test('marks before install are queued, not dropped, and drained into the tracker on install', () => {
        // No installCharacterSaveMarks() call yet.
        markCharacterForSave('queued-1')
        markCharacterForSave('queued-2')

        const tracker = makeTracker([])
        const schedule = vi.fn()
        installCharacterSaveMarks({ tracker, schedule })

        expect(tracker.character).toContain('queued-1')
        expect(tracker.character).toContain('queued-2')
        // Draining the queue on install requests exactly one save, not one per
        // queued id.
        expect(schedule).toHaveBeenCalledTimes(1)
    })

    test('a mark made after uninstall is queued again, not dropped, until the next install', () => {
        const trackerA = makeTracker([])
        const scheduleA = vi.fn()
        installCharacterSaveMarks({ tracker: trackerA, schedule: scheduleA })
        uninstallCharacterSaveMarks()

        markCharacterForSave('post-uninstall')
        expect(trackerA.character).toEqual([]) // not written to the old, now-uninstalled tracker
        expect(scheduleA).not.toHaveBeenCalled()

        const trackerB = makeTracker([])
        const scheduleB = vi.fn()
        installCharacterSaveMarks({ tracker: trackerB, schedule: scheduleB })

        expect(trackerB.character).toEqual(['post-uninstall'])
        expect(scheduleB).toHaveBeenCalledTimes(1)
    })

    test('re-installing (swapping the scheduler) with an already-empty queue does not spuriously call the new schedule', () => {
        const tracker = makeTracker([])
        const scheduleA = vi.fn()
        installCharacterSaveMarks({ tracker, schedule: scheduleA })

        const scheduleB = vi.fn()
        installCharacterSaveMarks({ tracker, schedule: scheduleB })

        expect(scheduleB).not.toHaveBeenCalled()
    })
})
