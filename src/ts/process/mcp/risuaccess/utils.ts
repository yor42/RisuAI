import { getCurrentCharacter, type character, type groupChat } from 'src/ts/storage/database.svelte'
import { DBState } from 'src/ts/stores.svelte'
import type { MCPToolCallContext } from '../mcplib'

export function getCharacter(id: string): character | groupChat {
  return id ? DBState.db.characters.find((c) => c.chaId === id || c.name === id) : getCurrentCharacter()
}

/**
 * Fork-specific internal API (Report 17 Stage 1 §3.3): resolves a character
 * for a MUTATING risuaccess tool and records its chaId in the per-call
 * context, so `callTool`'s `finally` (client.ts) can mark it for save after
 * the handler settles. Marking here, before the mutation, would not be
 * enough by itself -- every write in this handler follows an awaited
 * `promptAccess()` -- which is exactly why the actual mark happens in
 * `callTool`'s `finally`, not here.
 */
export function getCharacterForWrite(id: string, ctx: MCPToolCallContext): character | groupChat {
  const char = getCharacter(id)
  if (char?.chaId) {
    ctx.touched.add(char.chaId)
  }
  return char
}
