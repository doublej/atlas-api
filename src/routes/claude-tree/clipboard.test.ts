import { describe, expect, it } from 'vitest'
import { ancestorsLabel, ancestorsText } from './clipboard'

describe('ancestorsText', () => {
  it('puts each file under its banner, root first, three blank lines apart', () => {
    expect(
      ancestorsText([
        { label: '~', path: '/h/.claude/CLAUDE.md', content: 'global' },
        { label: 'web', path: '/h/dev/web/CLAUDE.md', content: 'local' },
      ]),
    ).toBe(
      '# ===== ~ =====\n# /h/.claude/CLAUDE.md\n\nglobal\n\n\n' +
        '# ===== web =====\n# /h/dev/web/CLAUDE.md\n\nlocal',
    )
  })
})

describe('ancestorsLabel', () => {
  it('counts the ancestors, singular and plural', () => {
    expect(ancestorsLabel('web', 0)).toBe('Copied web + 0 ancestors')
    expect(ancestorsLabel('web', 1)).toBe('Copied web + 1 ancestor')
    expect(ancestorsLabel('web', 3)).toBe('Copied web + 3 ancestors')
  })
})
