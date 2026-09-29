import { getCurrentCharacter, type character, type groupChat } from 'src/ts/storage/database.svelte'
import { DBState } from 'src/ts/stores.svelte'
import type { MCPToolCallContext } from '../mcplib'
import type { RunSubject } from '../../chatOrigin'

/**
 * With an `id`, the character with that id or name. Without one, the subject's owner when the call
 * carries a subject (undefined when the subject is gone or ambiguous -- never the selection), and the
 * selected character when it does not.
 */
export function getCharacter(id: string, subject?: RunSubject): character | groupChat {
  if (id) {
    return DBState.db.characters.find((c) => c.chaId === id || c.name === id)
  }
  if (subject) {
    return subject.resolve()?.owner
  }
  return getCurrentCharacter()
}

/**
 * Fork-specific internal API (CHORE-01): resolves a character for a MUTATING risuaccess tool. The tool
 * asks the user for confirmation next, and every write follows that awaited prompt, so the write goes
 * through `recheckCharacterForWrite` first; this only names the character the prompt is about.
 */
export function getCharacterForWrite(id: string, ctx: MCPToolCallContext): character | groupChat {
  return getCharacter(id, ctx.subject)
}

/**
 * Fork-specific internal API (CHORE-01): the character a mutating tool writes, resolved again after its
 * confirm prompt. Records its chaId in the per-call context (`touched`); the save marks of a whole call
 * are flushed in one place, `RisuAccessClient.callTool`'s `finally` (client.ts), which also covers a
 * handler that throws after a partial write. A refused write records nothing.
 *
 * With an `id`, or with no subject, the character chosen before the prompt is the target. With neither,
 * the subject is resolved again: null when it is gone or ambiguous. The check that the result still has
 * the chaId the prompt named is defensive only, since a subject's owner is found by its origin's chaId.
 */
export function recheckCharacterForWrite(id: string, ctx: MCPToolCallContext, chosen: character): character | null {
  const current = !id && ctx.subject ? getCharacter(id, ctx.subject) : chosen
  if (!current || current.type === 'group' || current.chaId !== chosen.chaId) {
    return null
  }
  if (current.chaId) {
    ctx.touched.add(current.chaId)
  }
  return current
}
