import { exec } from 'node:child_process'
import { json } from '@sveltejs/kit'
import { resolveLocal } from '$lib/config'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { path, command } = await request.json()

  if (!path) {
    return json({ error: 'Missing path' }, { status: 400 })
  }

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  // `command` is what makes this the single "open a terminal here and run X" route — the web UI
  // needs it for every launcher Raycast has (dev server, scripts, just recipes, claude, codex).
  const line = command ? `cd ${path} && ${command}` : `cd ${path}`
  const script = `
		tell application "iTerm"
			activate
			create window with default profile
			tell current session of current window
				write text "${line.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
			end tell
		end tell
	`

  return new Promise((resolve) => {
    exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (error) => {
      if (error) {
        resolve(json({ error: error.message }, { status: 500 }))
      } else {
        resolve(json({ opened: true }))
      }
    })
  })
}
