/**
 * Headless measurement: real $state.snapshot() cost over a proxied
 * `botPresets` array, to inform the fix for the rename-never-saves bug
 * (src/ts/globalApi.svelte.ts:612-618 only watches `botPresetsId` and
 * `botPresets.length` for change-detection, so an in-place field edit like
 * the preset-rename binding at src/lib/Setting/botpreset.svelte:192
 * (`bind:value={DBState.db.botPresets[i].name}`) never marks
 * `changeTracker.botPreset` dirty and is silently never persisted).
 *
 * Reuses the exact same rune primitives and methodology as
 * svelte-proxy-bench.{svelte.ts,harness.ts} from the earlier module/chat
 * measurement (same warm-up-then-discard-first, median-not-mean approach,
 * same in-run structuredClone floor for a fair ratio).
 *
 * Lives inside the repo, under Agents/Tools/save-gen/; only run against
 * ../vitest.harness.config.ts. `pnpm test` never discovers this file
 * because its `*.harness.ts` suffix doesn't match vitest's default
 * `*.spec.ts`/`*.test.ts` include glob.
 */
import { describe, test, expect } from 'vitest'
import { generateProse, mulberry32, SEED } from './build'
import { makeProxiedValue, snapshotValue } from './svelte-proxy-bench.svelte'

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15

function timeit(fn: () => unknown): { minMs: number; medianMs: number } {
    for (let i = 0; i < WARMUP_ITERATIONS; i++) fn()
    const samples: number[] = []
    for (let i = 0; i < MEASURED_ITERATIONS; i++) {
        const start = performance.now()
        fn()
        samples.push(performance.now() - start)
    }
    return { minMs: Math.min(...samples), medianMs: median(samples) }
}

/** Counts proxy-able nodes (every plain object/array is its own $state Proxy; primitives are not proxied). */
function countProxyNodes(value: unknown, seen = new WeakSet<object>()): number {
    if (value === null || typeof value !== 'object') return 0
    if (seen.has(value as object)) return 0
    seen.add(value as object)
    let count = 1
    if (Array.isArray(value)) {
        for (const v of value) count += countProxyNodes(v, seen)
    } else {
        for (const k in value as object) count += countProxyNodes((value as any)[k], seen)
    }
    return count
}

// ---------------------------------------------------------------------------
// Realistic botPreset builder, grounded in concrete evidence read from the
// repo (see chat report for citations):
//  - src/ts/storage/database.svelte.ts:1989-2022 `presetTemplate` (the
//    actual "new preset" default) has NO `promptTemplate` at all and is
//    almost entirely small scalars — a brand-new preset is tiny.
//  - src/ts/process/templates/templates.ts's THREE shipped example presets
//    ("NAI", "OAI", "OAI2") are the only concrete real-world size samples in
//    the repo:
//      "NAI":  promptTemplate has 10 items, all short/empty text -> small.
//      "OAI":  no promptTemplate; mainPrompt/jailbreak/globalNote are
//              hand-written paragraphs (~700/~600/~1400 chars).
//      "OAI2": promptTemplate has 13 items, two of which are ~1.9-2.0 KB
//              hand-written instruction blocks, PLUS its own long
//              mainPrompt/jailbreak/globalNote -> single preset serializes
//              to roughly 7-10 KB.
//  - Presets are shared as individual files (downloadPreset/importPreset,
//    database.svelte.ts:2293,2342 — `.json`/`.risupreset`/`.risup`), the
//    same one-file-per-item pattern as character cards, so a power user
//    accumulating community-shared presets over time is plausible — but
//    there is NO hub/browse UI or shipped default COUNT found anywhere in
//    the repo for presets (unlike characters). That count is genuinely
//    unevidenced; the tiers below are a defensible guess, not a derived
//    fact, and are labeled as such in the report.
// ---------------------------------------------------------------------------

type PresetWeight = 'minimal' | 'small' | 'detailed'

function makePromptTemplateItem(rng: () => number, weight: PresetWeight, idx: number): Record<string, unknown> {
    const kinds = ['plain', 'persona', 'description', 'lorebook', 'chat', 'authornote', 'memory'] as const
    const kind = kinds[idx % kinds.length]
    switch (kind) {
        case 'plain':
            return {
                type: idx === 0 ? 'plain' : 'plain',
                type2: idx === 0 ? 'main' : 'normal',
                role: 'system',
                text: weight === 'detailed' ? generateProse(rng, 800, 2200) : weight === 'small' ? generateProse(rng, 50, 200) : '',
            }
        case 'chat':
            return { type: 'chat', rangeStart: -6, rangeEnd: -2 }
        case 'lorebook':
            return { type: 'lorebook' }
        case 'authornote':
            return { type: 'authornote', innerFormat: weight === 'detailed' ? generateProse(rng, 100, 300) : undefined }
        default:
            return { type: kind, innerFormat: weight === 'detailed' ? generateProse(rng, 50, 150) : '----\n{{slot}}' }
    }
}

function makeBotPreset(rng: () => number, idx: number, weight: PresetWeight): Record<string, unknown> {
    const promptTemplateCount = weight === 'minimal' ? 0 : weight === 'small' ? randInt(rng, 8, 10) : randInt(rng, 13, 20)
    const preset: Record<string, unknown> = {
        name: `Preset ${idx}`,
        apiType: 'gemini-3-flash-preview',
        openAIKey: '',
        mainPrompt: weight === 'detailed' ? generateProse(rng, 500, 1200) : weight === 'small' ? generateProse(rng, 100, 300) : '',
        jailbreak: weight === 'detailed' ? generateProse(rng, 400, 1000) : '',
        globalNote: weight === 'detailed' ? generateProse(rng, 500, 1500) : '',
        temperature: 80,
        maxContext: 4000,
        maxResponse: 300,
        frequencyPenalty: 70,
        PresensePenalty: 70,
        formatingOrder: ['main', 'description', 'personaPrompt', 'chats', 'lastChat', 'jailbreak', 'lorebook', 'globalNote', 'authorNote'],
        promptPreprocess: false,
        bias: [] as [string, number][],
        ooba: {
            max_new_tokens: 180, do_sample: true, temperature: 0.7, top_p: 0.9, typical_p: 1,
            repetition_penalty: 1.15, encoder_repetition_penalty: 1, top_k: 20, min_length: 0,
            no_repeat_ngram_size: 0, num_beams: 1, penalty_alpha: 0, length_penalty: 1,
            early_stopping: false, seed: -1, add_bos_token: true, truncation_length: 4096,
            ban_eos_token: false, skip_special_tokens: true, top_a: 0, tfs: 1,
            epsilon_cutoff: 0, eta_cutoff: 0,
        },
        ainconfig: {
            top_p: 0.7, rep_pen: 1.0625, top_a: 0.08, rep_pen_slope: 1.7,
            rep_pen_range: 1024, typical_p: 1, badwords: '', stoptokens: '', top_k: 140,
        },
    }
    if (promptTemplateCount > 0) {
        preset.promptTemplate = Array.from({ length: promptTemplateCount }, (_, i) => makePromptTemplateItem(rng, weight, i))
    }
    if (weight === 'detailed') {
        preset.NAISettings = {
            topK: 12, topP: 0.85, topA: 0.1, tailFreeSampling: 0.915, repetitionPenalty: 2.8,
            repetitionPenaltyRange: 2048, repetitionPenaltySlope: 0.02, repostitionPenaltyPresence: 0,
            seperator: '', frequencyPenalty: 0.03, presencePenalty: 0, typicalp: 1, starter: '',
            cfg_scale: 1, mirostat_tau: 0, mirostat_lr: 1,
        }
        preset.openrouterProvider = { order: [], only: [], ignore: [] }
        preset.seperateParametersEnabled = true
        preset.seperateParameters = {
            memory: { temperature: 80 }, emotion: { temperature: 80 },
            translate: { temperature: 80 }, otherAx: { temperature: 80 }, overrides: {},
        }
    }
    return preset
}

function randInt(rng: () => number, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min
}

interface PresetTierConfig {
    count: number
    weights: PresetWeight[] // cycled across the preset list
}

// Tiers are a defensible-but-unevidenced guess (see file header) — labeled
// explicitly in the report, not presented as a measured fact.
const PRESET_TIERS: Record<string, PresetTierConfig> = {
    'light (default-ish)': { count: 3, weights: ['minimal', 'minimal', 'small'] },
    'moderate (power user)': { count: 15, weights: ['minimal', 'small', 'small', 'detailed'] },
    'heavy (collector)': { count: 50, weights: ['small', 'detailed', 'detailed'] },
}

describe('botPresets $state.snapshot() proxy-cost benchmark (headless)', () => {
    for (const [tierName, config] of Object.entries(PRESET_TIERS)) {
        test(`measures proxy snapshot cost for botPresets tier: ${tierName}`, () => {
            const rng = mulberry32(SEED + 4242 + tierName.length)
            const presets = Array.from({ length: config.count }, (_, i) => makeBotPreset(rng, i, config.weights[i % config.weights.length]))

            const bytes = new TextEncoder().encode(JSON.stringify(presets)).byteLength
            const nodeCount = countProxyNodes(presets)

            const floor = timeit(() => structuredClone(presets))

            const state = makeProxiedValue(presets)
            const proxy = timeit(() => snapshotValue(state))

            const ratio = proxy.medianMs / Math.max(floor.medianMs, 0.001)

            expect((snapshotValue(state) as unknown[]).length).toBe(presets.length)

            console.log(
                `[botPresets:${tierName}] count=${presets.length} bytes=${bytes} estimatedProxyNodes=${nodeCount} | ` +
                    `proxy min=${proxy.minMs.toFixed(3)}ms median=${proxy.medianMs.toFixed(3)}ms | ` +
                    `floor(structuredClone) min=${floor.minMs.toFixed(3)}ms median=${floor.medianMs.toFixed(3)}ms | ` +
                    `ratio(proxy/floor)=${ratio.toFixed(1)}x | ` +
                    `vs 16.7ms frame budget: ${((proxy.medianMs / 16.7) * 100).toFixed(1)}%`,
            )
        })
    }
})
