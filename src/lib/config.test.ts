import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEV_FOLDER, resolveInsideCatalog } from './config'

describe('resolveInsideCatalog', () => {
  it('takes a folder strictly inside the catalog, never its root or the global CLAUDE.md', () => {
    expect(resolveInsideCatalog(join(DEV_FOLDER, 'web', 'x'))).toBe(join(DEV_FOLDER, 'web', 'x'))
    expect(resolveInsideCatalog(DEV_FOLDER)).toBeNull()
    expect(resolveInsideCatalog(join(DEV_FOLDER, 'web', '..'))).toBeNull()
    expect(resolveInsideCatalog(join(homedir(), '.claude', 'CLAUDE.md'))).toBeNull()
  })
})
