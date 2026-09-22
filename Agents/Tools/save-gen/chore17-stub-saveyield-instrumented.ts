/**
 * CHORE-17 skip-measurement harness: an INSTRUMENTED passthrough for
 * `src/ts/storage/saveYield.ts`'s `createYieldBudget`, redirected in place
 * of the real module for `risuSave.ts`'s own import only (see the vite
 * config's importer-scoped rule) -- NOT a stub in the "fake behaviour"
 * sense used elsewhere in this directory.
 *
 * CORRECTED METHOD (found wrong twice before this, by running the harness
 * and having the coordinator check the numbers against the code, not
 * assumed): the first two attempts inferred "did `maybeYield()` actually
 * yield" from how long the call took to resume (first a 0.5ms threshold,
 * then 0.01ms) -- but `scheduler.yield()`/`MessageChannel` end the current
 * task and start a new one AS SOON AS THEY ARE CALLED, regardless of how
 * fast the browser resumes the continuation. A fast resume is still a real
 * task boundary; timing-based detection silently merged real yields back
 * into one slice whenever the resume happened to be fast, which is common
 * in an idle headless tab with nothing else on the main thread.
 *
 * The correct, direct signal: `createYieldBudget`'s own `opts.yieldFn` is
 * an explicit, exported extension point, called ONLY when the internal
 * `now() - last >= budgetMs` budget check is true (confirmed by reading
 * `saveYield.ts`'s `maybeYield()` body) -- i.e. exactly the "budget branch
 * was taken" event the coordinator asked to record directly. `risuSave.ts`
 * calls `createYieldBudget()` with no `opts`, so the real function's
 * default `yieldFn` (`yieldToEventLoop`) is what would run; this file
 * supplies its OWN `yieldFn` that records a timestamp and then calls the
 * real one, and hands THAT to the real, otherwise-untouched
 * `createYieldBudget`/`maybeYield`/`noteYielded`. No duration-based
 * inference anywhere in this version.
 *
 * State lives on `globalThis`, not a module-level closure variable (found
 * necessary earlier by running this harness): Rollup/rolldown inlined this
 * small module separately into more than one output chunk, so module-level
 * `let` state was NOT shared between risuSave.ts's copy and the entry
 * file's copy. A `globalThis`-keyed object is the same object regardless of
 * how many chunks the source text ends up duplicated into.
 */
import { createYieldBudget as realCreateYieldBudget, yieldToEventLoop } from 'src/ts/storage/saveYield'
import type { YieldBudget, YieldBudgetOptions } from 'src/ts/storage/saveYield'

type YieldState = {
    /** {enter, resolve} for every call where the REAL yieldFn (scheduler.yield()/MessageChannel) was actually invoked -- the budget branch was taken, full stop, independent of resume latency. */
    actualYieldTimestamps: { enter: number; resolve: number }[]
}
const STATE_KEY = '__CHORE17_YIELD_INSTRUMENTATION_STATE__'
function getState(): YieldState {
    const g = globalThis as unknown as Record<string, YieldState | undefined>
    if (!g[STATE_KEY]) {
        g[STATE_KEY] = { actualYieldTimestamps: [] }
    }
    return g[STATE_KEY]!
}

export function resetYieldInstrumentation(): void {
    getState().actualYieldTimestamps = []
}
/** {enter, resolve} timestamps for every call where the budget branch was actually taken (yieldFn invoked). */
export function getActualYieldTimestamps(): { enter: number; resolve: number }[] {
    return getState().actualYieldTimestamps
}

export function createYieldBudget(opts: YieldBudgetOptions = {}): YieldBudget {
    const realYieldFn = opts.yieldFn ?? yieldToEventLoop
    const instrumentedYieldFn = async () => {
        const enter = performance.now()
        await realYieldFn()
        const resolve = performance.now()
        getState().actualYieldTimestamps.push({ enter, resolve })
    }
    // Real, unwrapped noteYielded/maybeYield -- only yieldFn is intercepted,
    // and only to time it, not to change when it fires.
    return realCreateYieldBudget({ ...opts, yieldFn: instrumentedYieldFn })
}

export { yieldToEventLoop }
