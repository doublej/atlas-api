import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { moveFolderDescriptions, readDescriptions, writeDescriptions } from './descriptions'

describe('moveFolderDescriptions', () => {
  it('moves a folder and everything under it, not a sibling sharing its prefix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-desc-'))
    await writeDescriptions(dir, { 'web/foo': 'a', 'web/foo/app': 'b', 'web/foobar': 'c' })
    await moveFolderDescriptions(dir, join(dir, 'web/foo'), join(dir, 'web/baz'))
    expect(await readDescriptions(dir)).toEqual({
      'web/baz': 'a',
      'web/baz/app': 'b',
      'web/foobar': 'c',
    })
  })
})
