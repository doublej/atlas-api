import { json } from '@sveltejs/kit'
import { isLoopback, listSockets } from '$lib/ports'
import type { RequestHandler } from './$types'

/** Does anything listen on `port` right now, and can the NAS reach it? One `netstat`, ~20ms. */
export const GET: RequestHandler = async ({ url }) => {
  const port = Number(url.searchParams.get('port'))
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return json({ error: 'port must be an integer 1–65535' }, { status: 400 })
  }
  const on = (await listSockets()).filter((s) => s.port === port)
  // atlas's own NAS bridge sits on the LAN IP; judge the server by its own sockets.
  const own = on.filter((s) => s.pid !== process.pid)
  const server = own.length ? own : on
  return json({
    port,
    listening: on.length > 0,
    lanReachable: server.some((s) => !isLoopback(s.address)),
    ...(on.length ? { command: server[0].command } : {}),
  })
}
