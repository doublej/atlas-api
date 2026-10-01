/** Display text shared by server and client code: error messages and home-relative paths. */

/** The text to show for anything a `catch` received. */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * `/Users/<name>/dev` → `~/dev`. One rule on both sides: the browser cannot read `$HOME`, and the
 * server runs on macOS, where `$HOME` is always `/Users/<name>` — so the macOS home layout is the
 * rule, not the env var. `/Users/Shared` is not a home and stays as it is.
 */
export const tildify = (path: string): string =>
  path.replace(/^\/Users\/(?!Shared(?:\/|$))[^/]+(?=\/|$)/, '~')
