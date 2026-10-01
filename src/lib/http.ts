/**
 * The one way client code calls the atlas API: JSON in, JSON out, and a non-2xx response thrown
 * as an `HttpError` whose message is what the server said — the body's `error` (our routes), else
 * its `message` (SvelteKit's `error()`), else `<status> <statusText>`.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The parsed body, when there was one. */
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function field(body: unknown, key: 'error' | 'message'): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' && value ? value : undefined
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    const data = parse(text)
    const message =
      field(data, 'error') ?? field(data, 'message') ?? `${res.status} ${res.statusText}`.trim()
    throw new HttpError(res.status, message, data)
  }
  // An empty 2xx is `undefined`; a 2xx that is not JSON is a bug and throws a SyntaxError.
  return (text ? JSON.parse(text) : undefined) as T
}

export const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  delete: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body),
}
