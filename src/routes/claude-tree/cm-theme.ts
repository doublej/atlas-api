// The editor's syntax colours and chrome. Colours come from the global design tokens,
// so they flip with .dark like the rest of the app.

import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

export const highlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--color-fg)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--color-accent)' },
  { tag: tags.url, color: 'var(--color-accent)' },
  {
    tag: [tags.monospace, tags.tagName, tags.angleBracket, tags.attributeName],
    color: 'var(--color-info)',
  },
  { tag: tags.comment, color: 'var(--color-muted)' },
  { tag: tags.quote, color: 'var(--color-muted)' },
])

export const baseTheme = (isDark: boolean) =>
  EditorView.theme(
    {
      '&': { backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)', height: '100%' },
      '.cm-content': { fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '12px 0' },
      '.cm-scroller': { lineHeight: '1.65', overflow: 'auto' },
      '.cm-gutters': {
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-muted-2)',
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: 'var(--color-card-2)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--color-card-2)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--color-accent-soft)',
      },
      '.cm-cursor': { borderLeftColor: 'var(--color-fg)' },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--color-card-2)',
        color: 'var(--color-muted)',
        border: 'var(--hairline) solid var(--color-border)',
        borderRadius: '4px',
        margin: '0 4px',
        padding: '0 6px',
      },
      '.cm-xml-tag': { color: 'var(--color-info)' },
      '.cm-ref-link': {
        color: 'var(--color-accent)',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '2px',
      },
      '.cm-ref-link.cm-ref-dead': { color: 'var(--color-muted)', textDecoration: 'none' },
      '.cm-entity-action': {
        cursor: 'pointer',
        marginLeft: '10px',
        padding: '1px 7px',
        borderRadius: '6px',
        fontSize: '1.05em',
        lineHeight: '1',
        color: 'var(--color-accent)',
        background: 'var(--color-accent-soft)',
        border: 'var(--hairline) solid var(--color-accent-soft)',
        opacity: '0',
        userSelect: 'none',
        transition: 'opacity 120ms ease, transform 120ms ease',
      },
      '.cm-entity-line:hover .cm-entity-action': { opacity: '0.7' },
      '.cm-entity-action:hover': {
        opacity: '1',
        transform: 'scale(1.12)',
        borderColor: 'var(--color-accent)',
      },
      // While its menu is open, an entity's whole range is highlighted (the full section/block).
      '.cm-entity-active': { backgroundColor: 'var(--color-accent-soft)' },
      '.cm-entity-active .cm-entity-action': { opacity: '1' },
    },
    { dark: isDark },
  )
