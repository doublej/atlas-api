/** One-at-a-time async queue. Each `run(fn)` waits for every earlier call to settle first. */
export function createMutex() {
  let queue: Promise<unknown> = Promise.resolve()
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn)
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
