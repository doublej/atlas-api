// Lucide geometry, copied from lucide.dev at the 24x24 grid. The design system
// mandates Lucide; vendoring the dozen glyphs this UI needs keeps the icon set
// exact without pulling in the whole package. Re-copy from upstream if a glyph
// changes — this file is the only place icon geometry lives.

export type IconShape =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number }

export const icons = {
  terminal: [
    { t: 'path', d: 'm4 17 6-6-6-6' },
    { t: 'path', d: 'M12 19h8' },
  ],
  folder: [
    {
      t: 'path',
      d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    },
  ],
  folderOpen: [
    {
      t: 'path',
      d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2',
    },
  ],
  play: [{ t: 'path', d: 'M6 3 20 12 6 21Z' }],
  chevronRight: [{ t: 'path', d: 'm9 18 6-6-6-6' }],
  chevronDown: [{ t: 'path', d: 'm6 9 6 6 6-6' }],
  ellipsis: [
    { t: 'circle', cx: 12, cy: 12, r: 1 },
    { t: 'circle', cx: 19, cy: 12, r: 1 },
    { t: 'circle', cx: 5, cy: 12, r: 1 },
  ],
  pencil: [
    {
      t: 'path',
      d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
    },
    { t: 'path', d: 'm15 5 4 4' },
  ],
  globe: [
    { t: 'circle', cx: 12, cy: 12, r: 10 },
    { t: 'path', d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' },
    { t: 'path', d: 'M2 12h20' },
  ],
  chart: [
    { t: 'path', d: 'M3 3v18h18' },
    { t: 'path', d: 'M18 17V9' },
    { t: 'path', d: 'M13 17V5' },
    { t: 'path', d: 'M8 17v-3' },
  ],
  tree: [
    { t: 'rect', x: 16, y: 16, w: 6, h: 6, rx: 1 },
    { t: 'rect', x: 2, y: 16, w: 6, h: 6, rx: 1 },
    { t: 'rect', x: 9, y: 2, w: 6, h: 6, rx: 1 },
    { t: 'path', d: 'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3' },
    { t: 'path', d: 'M12 12V8' },
  ],
  sun: [
    { t: 'circle', cx: 12, cy: 12, r: 4 },
    { t: 'path', d: 'M12 2v2' },
    { t: 'path', d: 'M12 20v2' },
    { t: 'path', d: 'm4.93 4.93 1.41 1.41' },
    { t: 'path', d: 'm17.66 17.66 1.41 1.41' },
    { t: 'path', d: 'M2 12h2' },
    { t: 'path', d: 'M20 12h2' },
    { t: 'path', d: 'm6.34 17.66-1.41 1.41' },
    { t: 'path', d: 'm19.07 4.93-1.41 1.41' },
  ],
  moon: [{ t: 'path', d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  x: [
    { t: 'path', d: 'M18 6 6 18' },
    { t: 'path', d: 'm6 6 12 12' },
  ],
  search: [
    { t: 'circle', cx: 11, cy: 11, r: 8 },
    { t: 'path', d: 'm21 21-4.3-4.3' },
  ],
  refresh: [
    { t: 'path', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' },
    { t: 'path', d: 'M21 3v5h-5' },
    { t: 'path', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' },
    { t: 'path', d: 'M3 21v-5h5' },
  ],
  filter: [
    { t: 'line', x1: 21, y1: 4, x2: 14, y2: 4 },
    { t: 'line', x1: 10, y1: 4, x2: 3, y2: 4 },
    { t: 'line', x1: 21, y1: 12, x2: 12, y2: 12 },
    { t: 'line', x1: 8, y1: 12, x2: 3, y2: 12 },
    { t: 'line', x1: 21, y1: 20, x2: 16, y2: 20 },
    { t: 'line', x1: 12, y1: 20, x2: 3, y2: 20 },
    { t: 'line', x1: 14, y1: 2, x2: 14, y2: 6 },
    { t: 'line', x1: 8, y1: 10, x2: 8, y2: 14 },
    { t: 'line', x1: 16, y1: 18, x2: 16, y2: 22 },
  ],
  rows: [
    { t: 'path', d: 'M3 6h18' },
    { t: 'path', d: 'M3 12h18' },
    { t: 'path', d: 'M3 18h18' },
  ],
  gitBranch: [
    { t: 'line', x1: 6, y1: 3, x2: 6, y2: 15 },
    { t: 'circle', cx: 18, cy: 6, r: 3 },
    { t: 'circle', cx: 6, cy: 18, r: 3 },
    { t: 'path', d: 'M18 9a9 9 0 0 1-9 9' },
  ],
  check: [{ t: 'path', d: 'M20 6 9 17l-5-5' }],
  hardDrive: [
    { t: 'line', x1: 22, y1: 12, x2: 2, y2: 12 },
    {
      t: 'path',
      d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    },
    { t: 'line', x1: 6, y1: 16, x2: 6.01, y2: 16 },
    { t: 'line', x1: 10, y1: 16, x2: 10.01, y2: 16 },
  ],
  link: [
    { t: 'path', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    { t: 'path', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  ],
} satisfies Record<string, IconShape[]>

export type IconName = keyof typeof icons
