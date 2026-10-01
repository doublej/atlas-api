# UI primitives

The shared building blocks of the web console. A page migration uses these and nothing
hand-rolled: no local `fetch`, no `confirm()`, no page-local toast, side menu, `.err` / `.failures`
block or table selection code. Reference migrations: `src/routes/system/` and `src/routes/disk/`.

| Need | Use | Lives in |
|---|---|---|
| Call the API | `http` | `src/lib/http.ts` |
| Text for a caught error | `errorMessage(e)` | `src/lib/format.ts` |
| Home-relative path | `tildify(path)` | `src/lib/format.ts` |
| Ask before something destructive | `ConfirmDialog` | `src/lib/components/feedback/` |
| Result of an action | `toast(…)` | `src/lib/toast.svelte.ts` (+ `Toaster`, already mounted) |
| A state that stays on the page | `Notice` | `src/lib/components/feedback/` |
| Loading / error / empty | `PageState` | `src/lib/components/feedback/` |
| Data table | `Table` + `Column` | `src/lib/components/table/Table.svelte`, `src/lib/table.ts` |
| Row selection | `Selection` | `src/lib/selection.svelte.ts` |
| Tabs down the side | `SideNav` | `src/lib/components/SideNav.svelte` |

Everything is styled from `src/lib/styles/tokens.css`. Svelte 5 runes only.

---

## http — `$lib/http`

Replaces every client-side `fetch(...)` + `res.ok` check + `res.json()`.

```ts
import { HttpError, http } from '$lib/http'

const { daemons } = await http.get<{ daemons: DaemonRow[] }>('/api/daemons')
await http.post('/api/ports/kill', { pids })          // JSON body, content-type set for you
await http.put('/api/config', config)
await http.patch('/api/atlas', { path, patch })
await http.delete(`/api/disk/jobs/${id}`)
```

- Resolves to the parsed JSON body; an empty 2xx resolves to `undefined`.
- A non-2xx **throws `HttpError`** (`.status`, `.body`, `.message`). The message is the body's
  `error` field (our routes), else its `message` field (SvelteKit `error()`), else
  `"<status> <statusText>"`. So `errorMessage(e)` on a caught error is already the API's own text.
- Branch on the status only where it matters (`e instanceof HttpError && e.status >= 500`, see
  `poll()` in `src/routes/disk/disk-client.svelte.ts`).
- A network failure rejects with the browser's own `TypeError`.
- Server code (`+page.server.ts`) keeps using the `fetch` SvelteKit passes to `load`.

## errorMessage, tildify — `$lib/format`

```ts
import { errorMessage, tildify } from '$lib/format'

catch (e) { error = errorMessage(e) }   // Error → .message, anything else → String(e)
tildify('/Users/jj/dev/atlas')          // '~/dev/atlas'
```

`tildify` rule: a leading `/Users/<name>` (at a path boundary) becomes `~`; `/Users/Shared` and
everything else stay as they are. One rule for server and browser — the browser cannot read
`$HOME`, and the server runs on macOS where `$HOME` is always `/Users/<name>`.

## ConfirmDialog — `components/feedback/ConfirmDialog.svelte`

Replaces native `confirm()` and hand-built "are you sure" `Modal`s.

| Prop | Type | |
|---|---|---|
| `open` | `boolean` | |
| `title` | `string` | the question |
| `message?` | `string` | one paragraph under it |
| `items?` | `string[]` | what the action touches, one line each, in a scrolling list (40vh max) |
| `confirmLabel?` | `string` | default `Confirm` — use the verb: `Kill`, `Delete`, `Discard` |
| `danger?` | `boolean` | red confirm button; use it for anything that deletes, kills or discards |
| `onconfirm` | `() => unknown` | may be async: buttons are disabled and the confirm reads `Working…` until it settles; on success the dialog calls `onclose`, on a throw it shows `errorMessage(e)` and stays open |
| `onclose` | `() => void` | Cancel, Escape, or a successful confirm — set your `open` state false here |

Cancel has the focus when it opens (Enter right away never confirms); Escape cancels.

```svelte
<script lang="ts">
let killing = $state<number[] | null>(null)
</script>

<Button variant="danger" onclick={() => (killing = sel.list)}>Kill</Button>
<ConfirmDialog
  open={killing !== null}
  title="Kill {killing?.length} processes?"
  items={rowsFor(killing)}
  confirmLabel="Kill"
  danger
  onconfirm={() => http.post('/api/ports/kill', { pids: killing })}
  onclose={() => (killing = null)}
/>
```

For a guard in the middle of a flow (`if (dirty && !confirm(…)) return`), keep one
`asking = $state<{…; run: () => unknown} | null>` per page, set it instead of returning, and
render one ConfirmDialog with `onconfirm={() => asking?.run()}` — see `unlessDirty()` in
`src/routes/claude-tree/+page.svelte`. A window `keydown` handler should ignore keys while the
dialog is open (`if (asking) return`, or skip targets inside a `dialog`).

## toast — `$lib/toast.svelte`

The result of an action the user just took: "Copied", "Synced", "Kill failed: …". It goes away
by itself (4s, errors 8s) and can be dismissed. Replaces page-local toasts and transient
`.err`/`.ok` lines after a button.

```ts
import { toast } from '$lib/toast.svelte'

toast('Synced CLAUDE.md → AGENTS.md')
toast(`Save failed: ${errorMessage(e)}`, 'error')
```

Tones: `'info'` (default) and `'error'`. `<Toaster />` is mounted once in
`src/routes/+layout.svelte`; never mount another.

## Notice — `components/feedback/Notice.svelte`

A state that stays on the page until it changes: a read that failed, a restart still owed, a
doctor warning. Replaces `.failures` lists, `.banner`s and inline `<p class="err">` for page state.

| Prop | Type | |
|---|---|---|
| `tone?` | `'info' \| 'warn' \| 'error'` | default `info`; `error` is `role="alert"`, the others `role="status"` |
| `children` | snippet | the text; a `<ul>` inside renders as plain lines |
| `action?` | snippet | a trailing control (Retry, a link) |

```svelte
{#if data.errors.length}
  <Notice tone="error"><ul>{#each data.errors as e (e)}<li>{e}</li>{/each}</ul></Notice>
{/if}
<Notice tone="warn"><strong>Restart required.</strong> Run <code>bun run daemon:reload</code>.</Notice>
```

## PageState — `components/feedback/PageState.svelte`

The three states every section has, rendered one way. Wrap the section's content in it.

| Prop | Type | |
|---|---|---|
| `loading?` | `boolean` | first load in flight → one muted line (`loadingText`, default `Loading…`) instead of the content. Pass it for the *first* load only; a refresh keeps the old content |
| `error?` | `string \| null` | an error `Notice` above the content; when `empty` too, the error is all that shows |
| `onretry?` | `() => void` | adds a Retry button to the error |
| `empty?` | `boolean` | nothing to show → `emptyText` (default `Nothing here yet.`) + optional `emptyAction` snippet |
| `children` | snippet | the content, rendered when not loading and not empty |

Order: error (if any) → loading line, else empty text (only without an error), else children.

```svelte
<PageState loading={!loaded && !error} {error} onretry={reload} empty={!rows.length}
           emptyText="The operation log is empty.">
  <Card flush>…</Card>
</PageState>
```

Children narrow nothing for TypeScript: inside, re-check a nullable (`{#if audit}…{/if}`) —
see `src/routes/system/PortsSection.svelte`.

## Selection — `$lib/selection.svelte`

One selection per table (or per group of sibling tables), keyed by a stable row id.

**The rule, on every page:**

- **plain click** selects only that row; clicking the only selected row clears it
- **cmd/ctrl-click**, the row's **checkbox**, or **`x` / Space** toggles that row and keeps the rest
- **shift-click** adds every row from the anchor to this one (in `order`) and keeps the rest
- the **anchor** is the last row clicked or toggled without shift; a shift-click with no anchor in
  `order` acts as a plain click

```ts
const sel = new Selection<string>()   // or Selection<number>
sel.has(id) · sel.size · sel.list      // list: ids in selection order
sel.click(id, mouseEvent, order)       // the rule above; order = visible ids in render order
sel.toggle(id) · sel.set(ids, on) · sel.clear()
$effect(() => sel.prune(rows.map((r) => r.id)))   // after every refresh: drop ids that are gone
```

`Table` calls `click`/`toggle` for you. Call `prune` yourself whenever the data reloads, and
`clear()` after an action consumed the selection. Page-level keys (Escape clears, cmd+A selects
all) stay on the page — see `src/routes/ports/+page.svelte`.

## Table — `components/table/Table.svelte`

Replaces hand-built `<table>`s with `SortHeader`, `.scroll` wrappers, checkbox columns and
row-click selection code.

| Prop | Type | |
|---|---|---|
| `label` | `string` | accessible name |
| `rows` | `T[]` | unsorted; the table sorts |
| `key` | `(row) => K` | **unique per row** — each-key, selection key and expanded key |
| `columns` | `Column<T>[]` | see below |
| `sort?` | `TableSort<string>` | pass one to open on a column, to set descending-first columns, or to share it across sibling tables; otherwise the table owns one |
| `selection?` | `Selection<K>` | adds the checkbox column (header checkbox = all rows of *this* table, with indeterminate), click and `x`/Space selection |
| `order?` | `K[]` | every visible id across sibling tables, so shift-click ranges cross them; default this table's rows |
| `rowLabel?` | `(row) => string` | the row checkbox's label; default the key |
| `dim?` | `(row) => boolean` | faded row (skipped, nested, refused) |
| `expanded?` | snippet `(row)` | full-width content under an opened row (one open at a time) |
| `empty?` | snippet | body when `rows` is empty; default `Nothing to show.` |
| `maxHeight?` | CSS length | caps the height; the header sticks while the body scrolls |

`Column<T>` (`$lib/table`):

| Field | |
|---|---|
| `key` | unique in the table; also the sort key |
| `label` | header text |
| `cell` | snippet `(row, state)`; `state` is `{ selected, open, toggleOpen }` |
| `sort?` | `(row) => string \| number \| null \| undefined` — makes the header a sort button; blanks sort last |
| `align?` | `'right'` for numbers and sizes |
| `wrap?` | lets the cell wrap anywhere (min 12rem) instead of one line |
| `hideBelow?` | `768 \| 1100` — hide the column below that viewport width |
| `hideLabel?` | header label for screen readers only (icon columns) |

Mouse and keyboard:

- row click → `selection.click` when there is a `selection`; else toggles `expanded`. Clicks on
  a link, button, input, select, textarea, label or summary inside the row are left alone.
- rows use roving focus (one row in the tab order): `j`/`k` or ↓/↑ move, `x`/Space toggle
  selection, Enter opens/closes `expanded`. Modified keys pass through to the browser.

Cell snippets are declared at the top level of the page's markup and referenced from `columns`
in the script; they keep the page's scoped CSS.

```svelte
<script lang="ts">
const sel = new Selection()
const sort = new TableSort<string>(null, ['size'])   // size opens high-to-low
const columns: Column<ArchiveVersion>[] = [
  { key: 'id', label: 'Version', sort: (v) => v.id, cell: idCell },
  { key: 'size', label: 'Size', sort: (v) => v.bytes, align: 'right', cell: sizeCell },
  { key: 'open', label: 'Contents', hideLabel: true, cell: contentsCell },
]
$effect(() => sel.prune(archives.map((v) => v.id)))
</script>

{#snippet idCell(v: ArchiveVersion)}<span class="mono">{v.id}</span>{/snippet}
{#snippet sizeCell(v: ArchiveVersion)}<span class="num">{human(v.bytes)}</span>{/snippet}
{#snippet contentsCell(v: ArchiveVersion)}<Button onclick={() => show(v.id)}>Contents</Button>{/snippet}
{#snippet none()}No archives yet.{/snippet}

<Card flush>
  <Table label="Archive versions" rows={archives} key={(v) => v.id} {columns} {sort}
         selection={sel} empty={none} />
</Card>
```

Grouped tables (one card per group, like `/ports` and the disk cleanup list): render one `Table`
per group, pass the same `sort` and `selection` to each, and `order` = all groups' ids in render
order. The group's own header (its checkbox, a "kill all") stays page markup above each Table.

Known fits and gaps for the pending migrations:

- `/ports`: rows are per port but kills are per pid, and one pid can hold several ports. Key and
  select by **port** (`key={(l) => l.port}`), and map the selected ports to unique pids when
  killing — a pid key would collide in the each-block.
- `ProjectTable`: no selection, `expanded = detail`, the name cell's button calls
  `state.toggleOpen()` and reads `state.open`; `path` is `hideBelow: 768`, branch/CLAUDE.md are
  `hideBelow: 1100`; build `columns` with `$derived` to drop Host when `!showHost`; open with
  `new TableSort('modified', ['git', 'links', 'claude', 'modified', 'run'])`. The Table has one
  density (8px cell padding, 13px text), so its rows are taller than `ProjectLine`'s 30px.
- disk cleanup: the group checkbox selects only non-nested rows, the Table header checkbox selects
  all rows; keep the page's group checkbox if that difference matters.
- disk trim plan: make one row type for steps and refused items (`dim` for both kinds of skip).
- disk log: the Table always has a header row (the hand-built one has none).
- `DiskArchiveModal`: its always-visible risk sub-row is not an `expanded` row; render the risk as
  a `wrap` cell instead.

## SideNav — `components/SideNav.svelte`

The `?tab=` side menu page shell, which `/system` and `/disk` each used to copy. It renders the
whole page: `<main>` grid, sticky aside with heading, menu, and the content column (sections
spaced by `--section-gap`). Below 768px the menu becomes a horizontal scroller above the content
and hints hide.

| Prop | Type | |
|---|---|---|
| `title` | `string` | the page `h1` |
| `label` | `string` | the menu's accessible name (`System sections`) |
| `tabs` | `SideTab[]` | `{ id, label, hint?, alert? }` — `alert > 0` shows a red count |
| `active` | `string` | the tab on screen |
| `summary?` | snippet | lines between heading and menu |
| `class?` | `string` | class on `<main>` (the disk page hangs `disk.css` off `main.disk`) |
| `children` | snippet | the active tab's content |

```svelte
<script lang="ts">
import SideNav, { type SideTab } from '$lib/components/SideNav.svelte'
const tabs = $derived<SideTab[]>([{ id: 'hosts', label: 'Hosts', hint: '3 machines', alert: 1 }])
const active = $derived(tabs.find((t) => t.id === page.url.searchParams.get('tab'))?.id ?? 'hosts')
</script>

<SideNav title="System" label="System sections" {tabs} {active}>
  {#if active === 'hosts'}<HostsSection … />{/if}
</SideNav>
```
