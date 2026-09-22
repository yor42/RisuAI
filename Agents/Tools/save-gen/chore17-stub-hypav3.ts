/**
 * CHORE-17 follow-up harness stub for `src/ts/process/memory/hypav3.ts`.
 *
 * `database.svelte.ts` imports only `createHypaV3Preset` (a value; the two
 * other named imports are types, erased at build) from this 2000+ line
 * memory-compression subsystem, which itself reaches `webllm`, contextual
 * embedding, and a tokenizer -- all unrelated to the setDatabase path this
 * harness measures. `setDatabase()` only calls `createHypaV3Preset()` as a
 * default-fill when `data.hypaV3Presets` is nullish; this fixture never sets
 * that field, so the call happens but its result is never deep-inspected by
 * anything this harness measures.
 */
export function createHypaV3Preset(): Record<string, unknown> {
    return { name: 'chore17-harness-stub-hypav3-preset', settings: {} }
}
