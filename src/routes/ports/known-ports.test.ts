import { describe, expect, it } from 'vitest'
import { macosName } from './known-ports'

describe('macosName', () => {
  it('names the macOS service only on a port no project, service or container owns', () => {
    expect(macosName({ group: 'system', port: 5000 })).toBe('AirPlay Receiver')
    for (const group of ['project', 'service', 'docker'] as const)
      expect(macosName({ group, port: 5000 })).toBeUndefined()
  })
})
