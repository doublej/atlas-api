<script lang="ts">
import { frameworkColor, typeColor } from '$lib/browser/colors'
import Icon from '$lib/components/icons/Icon.svelte'
import type { GitStatus, Project } from '$lib/scanner'
import { getDynamicActions } from '$shared/actions'
import { getHostById } from '$shared/hosts'

interface Props {
  project: Project
  git?: { status: GitStatus; branch?: string }
  hostname?: { local: string; remote: string }
  runningUrl?: string
  showHost: boolean
  open: boolean
  onToggle: () => void
  onRunDev: (project: Project) => void
}

const {
  project: p,
  git,
  hostname,
  runningUrl,
  showHost,
  open,
  onToggle,
  onRunDev,
}: Props = $props()

const named = $derived(p.framework && p.framework !== 'unknown')
const stack = $derived(named ? p.framework : (p.type ?? ''))
const swatch = $derived(
  p.framework && p.framework !== 'unknown' ? frameworkColor(p.framework) : typeColor(p.type ?? ''),
)
const domains = $derived(getDynamicActions('domain-open', p))

const DAY = 86_400_000
/** Compact age for a narrow column: `today`, `12d`, `5mo`, `3y`. The tooltip carries the date. */
function age(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY)
  if (days < 1) return 'today'
  if (days < 60) return `${days}d`
  if (days < 730) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

const tokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const stop = (e: Event): void => e.stopPropagation()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions — the name button is the keyboard path; the row click is a larger target -->
<tr class:open onclick={onToggle}>
  <td class="dot-col">
    <span class="git" data-status={git?.status ?? 'loading'} title={git?.status ?? 'loading'}></span>
  </td>
  <td class="name">
    <button
      type="button"
      aria-expanded={open}
      onclick={(e) => {
        stop(e)
        onToggle()
      }}
    >
      {p.name}
    </button>
    {#if p.description}<span class="desc">{p.description}</span>{/if}
  </td>
  <td class="path mono" title={p.path}>{p.relativePath}</td>
  <td>
    {#if stack}
      <span class="swatch" style:background={swatch}></span>{stack}
      {#if p.runner}<span class="muted">{p.runner}</span>{/if}
    {/if}
  </td>
  <td class="opt mono muted">{git?.branch ?? ''}</td>
  {#if showHost}
    <td class:remote={!p.isLocal}>{getHostById(p.host)?.label ?? p.host}</td>
  {/if}
  <td>
    <span class="links">
      {#if runningUrl}
        <a class="live" href={runningUrl} target="_blank" rel="noreferrer" onclick={stop} title={runningUrl}>live</a>
      {:else if hostname}
        <a href={hostname.local} target="_blank" rel="noreferrer" onclick={stop} title={hostname.local} aria-label="Dev hostname">
          <Icon name="link" size={12} />
        </a>
      {/if}
      {#each domains as link (link.value)}
        <a href={link.value} target="_blank" rel="noreferrer" onclick={stop} title={link.name} aria-label={link.name}>
          <Icon name="globe" size={12} />
        </a>
      {/each}
    </span>
  </td>
  <td class="opt num muted">{p.agentFiles?.claude ? tokens(p.agentFiles.claude.tokens) : ''}</td>
  <td class="num muted">
    <time datetime={p.modifiedAt} title={new Date(p.modifiedAt).toLocaleString()}>{age(p.modifiedAt)}</time>
  </td>
  <td class="run-col">
    {#if p.isLocal && p.devCommand}
      <button
        type="button"
        class="run"
        title="Run {p.devCommand}"
        aria-label="Run {p.name}"
        onclick={(e) => {
          stop(e)
          onRunDev(p)
        }}
      >
        <Icon name="play" size={11} />
      </button>
    {/if}
  </td>
</tr>

<style>
  tr {
    cursor: pointer;
  }

  tr:hover,
  tr.open {
    background: var(--color-card-2);
  }

  td {
    height: 30px;
    padding: 0 var(--space-2);
    white-space: nowrap;
    border-bottom: var(--hairline) solid var(--color-border);
    color: var(--color-fg);
  }

  .dot-col {
    width: 14px;
    padding-right: 0;
  }

  .git {
    display: block;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--color-disabled);
  }

  .git[data-status='clean'] {
    background: var(--status-clean);
  }
  .git[data-status='dirty'] {
    background: var(--status-dirty);
  }
  .git[data-status='error'] {
    background: var(--status-error);
  }
  .git[data-status='no-repo'] {
    background: var(--status-idle);
  }

  /* The name column absorbs the slack: name first, the description trailing off after it. */
  .name {
    width: 40%;
    max-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name button {
    padding: 0;
    font: inherit;
    font-weight: 500;
    color: var(--color-fg);
    background: none;
    border: none;
    cursor: pointer;
  }

  .desc {
    margin-left: var(--space-2);
    color: var(--color-muted-2);
  }

  .path {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-muted);
  }

  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .muted {
    color: var(--color-muted-2);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .swatch {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    border-radius: 2px;
    vertical-align: 1px;
  }

  .swatch + .muted,
  td > .muted {
    margin-left: var(--space-1);
  }

  .remote {
    color: var(--color-warn);
  }

  .links {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .links a {
    display: inline-flex;
    color: var(--color-muted);
  }

  .links a:hover {
    color: var(--color-accent);
  }

  .links .live {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-pos);
  }

  .run-col {
    width: 28px;
  }

  .run {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--color-muted);
    background: none;
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-xs);
    cursor: pointer;
    opacity: 0;
  }

  tr:hover .run,
  .run:focus-visible {
    opacity: 1;
    border-color: var(--color-border);
  }

  .run:hover {
    color: var(--color-accent);
  }

  @media (max-width: 1100px) {
    .opt {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .path,
    .desc {
      display: none;
    }
  }

  @media (hover: none) {
    .run {
      opacity: 1;
    }
  }
</style>
