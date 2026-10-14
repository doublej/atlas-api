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

// `Date#toLocaleString()` builds a formatter on every call: ~55µs each under Bun, ~5ms for the 80
// rows `/` server-renders. These are exactly its default fields, so the text is the same.
const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

/** `new Date(value).toLocaleString()`, with one shared formatter. */
export const localDateTime = (value: string | number | Date): string =>
  DATE_TIME.format(new Date(value))
