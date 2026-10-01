import { json } from '@sveltejs/kit'
import { SlugTakenError } from '../caddyDev'

/** Runs a route body; a slug clash becomes the 409 `{ error, holder }` every slug write answers. */
export async function answeringTaken(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof SlugTakenError) {
      return json({ error: e.message, holder: e.holder }, { status: 409 })
    }
    throw e
  }
}
