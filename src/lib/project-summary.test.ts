import { describe, expect, it } from 'vitest'
import { projectHref } from './project-summary'

describe('projectHref', () => {
  it('encodes segments and leaves a local project without a host', () => {
    expect(projectHref({ relativePath: 'web/my app', host: 'm2', isLocal: true })).toBe(
      '/p/web/my%20app',
    )
  })

  it("turns a Windows relativePath into segments and names a remote project's host", () => {
    expect(projectHref({ relativePath: 'web\\foo', host: 'fractal' })).toBe(
      '/p/web/foo?host=fractal',
    )
  })
})
