import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv } from 'vite'

// The repository root, where Vite looks for .env files. loadEnv is Vite's own resolver, the one
// `vite`, `vite build` and Vitest use, so these results are what the build bakes into import.meta.env.
const repoRoot = resolve(__dirname, '..', '..')
const FLAG = 'VITE_RISU_LEGAL_CONFIGURED'

describe('VITE_RISU_LEGAL_CONFIGURED default', () => {
    let savedFlag: string | undefined
    const scratchDirs: string[] = []

    beforeEach(() => {
        // A value in the developer's shell would mask the files under test.
        savedFlag = process.env[FLAG]
        delete process.env[FLAG]
    })

    afterEach(() => {
        if (savedFlag === undefined) {
            delete process.env[FLAG]
        } else {
            process.env[FLAG] = savedFlag
        }
        for (const dir of scratchDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('is TRUE for production builds when the builder sets nothing', () => {
        expect(loadEnv('production', repoRoot, 'VITE_')[FLAG]).toBe('TRUE')
    })

    it('is TRUE for development builds when the builder sets nothing', () => {
        expect(loadEnv('development', repoRoot, 'VITE_')[FLAG]).toBe('TRUE')
    })

    it('stays unset in test mode, so tests that stub the flag or rely on it being unset are unaffected', () => {
        expect(loadEnv('test', repoRoot, 'VITE_')[FLAG]).toBeUndefined()
    })

    it('lets an empty value in the build environment opt out', () => {
        process.env[FLAG] = ''
        expect(loadEnv('production', repoRoot, 'VITE_')[FLAG]).toBe('')
        expect(loadEnv('development', repoRoot, 'VITE_')[FLAG]).toBe('')
    })

    it('lets an untracked mode-local env file with an empty value opt out', () => {
        const dir = mkdtempSync(join(tmpdir(), 'risu-legal-flag-'))
        scratchDirs.push(dir)
        writeFileSync(join(dir, '.env.production'), `${FLAG}=TRUE\n`)
        writeFileSync(join(dir, '.env.production.local'), `${FLAG}=\n`)
        expect(loadEnv('production', dir, 'VITE_')[FLAG]).toBe('')
    })
})
