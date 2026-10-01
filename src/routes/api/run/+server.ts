import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { basename, join } from 'node:path'
import { json } from '@sveltejs/kit'
import { ensureRoute, SlugTakenError } from '$lib/caddyDev'
import { DEV_FOLDER, resolveLocal } from '$lib/config'
import { slugHolder } from '$lib/hostnames/claims'
import type { HostnameState } from '$lib/hostnames/types'
import {
  allocatePort,
  devFlags,
  discoverBoundPort,
  releaseAllocatedPort,
  stopProjectListeners,
} from '$lib/ports'
import { currentSlug, scan, setPort, updateCachedPort } from '$lib/scanner'
import { bridgeProject } from '$lib/services'
import type { RequestHandler } from './$types'

/** How long POST waits for the dev server to bind before answering with the allocated port, unless the body's `wait` says longer. */
const EARLY_WAIT_MS = 8_000
/** How long the watch keeps running after that, to correct the route once the server is up. */
const DISCOVERY_TIMEOUT_MS = 60_000
/** Dev-server logs, under `~/dev` next to the scan cache. */
const LOG_DIR = '.atlas-logs'

/** Resolves `undefined` — the "still booting" arm of the race against port discovery. */
function waitFor(ms: number): Promise<undefined> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A child inherits the daemon's own `PORT`/`HOST` (47891 / 127.0.0.1, from its plist) unless
 * they're stripped — and every dev server that honours `PORT` then aims at atlas-api's own
 * port instead of its own. Wrangler dies on it outright ("Unexpected server response: 101"),
 * taking a `concurrently` sibling down with it; Next and Nuxt would quietly fail to bind.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.PORT
  delete env.HOST
  return env
}

/** Where a dev server's output goes, so a start that dies isn't a silent one. */
function openLog(path: string, slug: string | undefined): { file: string; fd: number } {
  const dir = join(DEV_FOLDER, LOG_DIR)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${slug ?? basename(path)}.log`)
  return { file, fd: openSync(file, 'w') }
}

/** Is the spawned process still around? A dead one this early means the dev server failed. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Point the project's hostname at `port`, and give a loopback-only server the NAS-only bridge
 * (otherwise the hostname 502s). Only the URLs of a route the NAS confirmed are returned.
 */
async function routeTo(
  route: { slug: string; path: string; devPublic?: boolean },
  bound: { port: number; lanReachable: boolean } | null,
  port: number,
): Promise<Pick<HostnameState, 'local' | 'remote'> | null> {
  const state = await ensureRoute({ ...route, port })
  if (!state.nasSynced) return null
  if (bound) await bridgeProject(port)
  return { local: state.local, remote: state.remote }
}

/** Record the port the dev server really took, in `.atlas` and in the cache the next run reads. */
async function persistPort(path: string, port: number): Promise<void> {
  await setPort(path, port)
  await updateCachedPort(DEV_FOLDER, path, port)
}

export const POST: RequestHandler = async ({ request }) => {
  const { path, command, runner, type, wait } = await request.json()

  if (!path || !command) {
    return json({ error: 'Missing path or command' }, { status: 400 })
  }

  // Before anything is spawned or allocated: a remote path would still allocate a port,
  // ENOENT on setPort, spawn into a nonexistent cwd, and — worst — hand `project.slug` to
  // ensureRoute, which keys the Caddy registry and the NAS `<slug>-atlas.caddy` file by slug.
  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  const atlas = await scan(DEV_FOLDER) // cached, stale-while-revalidate — no new fs walk
  const project = atlas.projects.find((p) => p.path === path)
  const slug = project ? await currentSlug(project) : basename(path)
  // Refused before anything spawns: the server would run, but under someone else's hostname.
  const holder = project ? await slugHolder(slug, path) : null
  if (holder) {
    return json({ error: new SlugTakenError(slug, holder).message, holder }, { status: 409 })
  }
  const port = project?.port ?? (await allocatePort(atlas))
  if (!project?.port) {
    await setPort(path, port)
    await updateCachedPort(DEV_FOLDER, path, port)
    releaseAllocatedPort(port) // now covered by reservedPorts() via the patched cache instead
  }

  // Whatever of this project already listens on its port goes first, and this waits until
  // it is gone: the previous run (from any daemon life — nothing is remembered in memory),
  // or a `bun run dev` left in a terminal. Otherwise the new server finds the port taken,
  // moves to port+1 without a word, and the hostname keeps pointing at the squatter.
  const replaced = await stopProjectListeners(path, port)

  let cmd: string
  let args: string[]

  if (type === 'just') {
    cmd = 'just'
    args = [command]
  } else if (runner === 'uv') {
    cmd = 'uv'
    args = ['run', command]
  } else {
    cmd = runner === 'bun' ? 'bun' : runner === 'yarn' ? 'yarn' : runner === 'pnpm' ? 'pnpm' : 'npm'
    // --host 0.0.0.0: Vite (and most dev servers built on it) binds localhost-only by
    // default, unreachable from the NAS or any other LAN device — the dev hostname would
    // resolve and pass auth, then 502 at the reverse_proxy hop with nothing actually broken.
    // Only a script that is a single process forwarding its argv can act on either flag; the
    // rest are steered by watching what they bind, not by telling them where to bind.
    const flags = devFlags(project?.scripts?.[command], port)
    args = runner === 'npm' ? ['run', command, '--', ...flags] : [command, ...flags]
  }

  // spawn() can fail two ways: throw synchronously (Bun does this for ENOENT — e.g. a
  // runner that isn't on the daemon's deliberately minimal launchd PATH), or emit an async
  // 'error' event per Node's documented behavior. Either one, left unhandled, crashes the
  // whole daemon process — not just this request — which is what actually happened here
  // (KeepAlive silently restarted it; every other request/connection dropped with it).
  const log = openLog(path, slug)
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(cmd, args, {
      cwd: path,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      env: childEnv(),
    })
  } catch (err) {
    return json(
      { error: `Failed to start '${cmd}': ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }

  child.on('error', (err) => {
    console.error(`run: '${cmd}' failed for ${path} — ${err.message}`)
  })

  closeSync(log.fd) // the child holds its own dup of the descriptor
  child.unref()

  const pid = child.pid!

  // The dev server picks the port, not atlas: `--port` never reaches one behind a wrapper
  // (concurrently, turbo) or pinned in a vite.config, and it shifts on its own when the port
  // it wanted was taken. So route to what the process group actually binds. Answer as soon as
  // that shows up; a slower boot gets the allocated port now and a corrected route the moment
  // it binds, and a command that binds nothing at all (a build script) just never resolves it.
  // Only the dev command is worth waiting on: a one-off script (a build, a codegen recipe)
  // binds nothing, and the action that runs one shouldn't sit through the wait to find out.
  // A caller that has nothing better to do (the CLI) asks to wait for the bind itself, since
  // a cold Vite with a dependency re-optimisation takes ~30s and 8s says nothing about it.
  const waitMs = Math.min(Number(wait) || EARLY_WAIT_MS, DISCOVERY_TIMEOUT_MS)
  const discovery = discoverBoundPort(pid, port, DISCOVERY_TIMEOUT_MS)
  const bound = await Promise.race([
    discovery,
    waitFor(command === project?.devCommand ? waitMs : 0),
  ])

  const finalPort = bound?.port ?? port
  if (bound && bound.port !== port) await persistPort(path, bound.port)

  const route = { slug, path, devPublic: project?.devPublic }
  const hostnames = project ? await routeTo(route, bound ?? null, finalPort) : null

  if (bound === undefined && project) {
    discovery
      .then(async (late) => {
        if (!late) return
        if (late.port !== finalPort) await persistPort(path, late.port)
        await routeTo(route, late, late.port)
      })
      .catch((err) => console.warn(`run: late port reroute failed for ${path} — ${err}`))
  }

  return json({
    port: finalPort,
    pid,
    url: `http://localhost:${finalPort}`,
    log: log.file,
    bound: Boolean(bound),
    replaced: replaced.length,
    ...(bound && !bound.lanReachable ? { lanReachable: false } : {}),
    ...(bound === undefined && !isAlive(pid) ? { exited: true } : {}),
    ...hostnames,
  })
}

export const DELETE: RequestHandler = async ({ request }) => {
  const { path } = await request.json()

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  const atlas = await scan(DEV_FOLDER)
  const port = atlas.projects.find((p) => p.path === path)?.port
  const stopped = port ? await stopProjectListeners(path, port) : []
  if (port) await bridgeProject(port) // closes a loopback bridge left with nothing behind it
  return json({ stopped: stopped.length > 0 })
}
