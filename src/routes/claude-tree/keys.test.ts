import { describe, expect, it } from 'vitest'
import { keyAction } from './keys'

const key = (k: string, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  ...mods,
})

describe('keyAction', () => {
  it('maps Escape to dismiss, with or without modifiers', () => {
    expect(keyAction(key('Escape'))).toBe('dismiss')
    expect(keyAction(key('Escape', { metaKey: true }))).toBe('dismiss')
  })

  it('maps ⌘S and Ctrl-S (either case) to save', () => {
    expect(keyAction(key('s', { metaKey: true }))).toBe('save')
    expect(keyAction(key('S', { ctrlKey: true }))).toBe('save')
  })

  it('maps ⌘F and Ctrl-F to find', () => {
    expect(keyAction(key('f', { metaKey: true }))).toBe('find')
    expect(keyAction(key('F', { ctrlKey: true }))).toBe('find')
  })

  it('leaves plain typing and other shortcuts alone', () => {
    expect(keyAction(key('s'))).toBeNull()
    expect(keyAction(key('f'))).toBeNull()
    expect(keyAction(key('z', { metaKey: true }))).toBeNull()
  })
})
