// The atlas toolbar: the NAS Caddy appends this script to every HTML page of a project's LAN dev
// hostname (`renderSiteBlock`), in place of the `lan_banner` — so it carries the "LAN only" label.
// Built the way Next.js mounts its dev indicator: one custom element with its own shadow root,
// inside a <script> wrapper on <body> (hydration tolerates an extra script, not an extra div) and
// put back if a framework's render removes it. A small pill in a corner opens a menu, drags to
// snap to another corner (kept in localStorage) and hides in this tab from the menu. It talks to
// `/api/toolbar` on the console, which acts only on the project this page's hostname names.
;(() => {
  const TAG = 'atlas-toolbar'
  if (window.top !== window || document.querySelector(TAG)) return
  const api = `${new URL(document.currentScript.src).origin}/api/toolbar`
  const CORNER = 'atlas-toolbar:corner'
  const HIDDEN = 'atlas-toolbar:hidden'
  if (sessionStorage.getItem(HIDDEN)) return

  const call = (method, body) =>
    fetch(api, {
      method,
      body: body && JSON.stringify(body),
      headers: body ? { 'Content-Type': 'text/plain' } : undefined,
    }).then(
      async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(`atlas: ${data.error || `HTTP ${r.status}`}`)
        return data
      },
      () => {
        throw new Error('atlas is not answering, so restart and stop are unavailable')
      },
    )

  const host = document.createElement(TAG)
  const root = host.attachShadow({ mode: 'open' })
  // The dashed outline is a map's boundary line, the glyph a dot inside one: this page sits
  // inside the home network. The boundary is the one loud thing; it marches while atlas works.
  const ring =
    '<svg class=ring width=16 height=16 viewBox="0 0 14 14" aria-hidden=true><circle cx=7 cy=7 ' +
    'r=5.5 fill=none stroke=currentColor stroke-width=1.5 stroke-dasharray="2.2 1.8"/>' +
    '<circle cx=7 cy=7 r=2 fill=currentColor /></svg>'
  const slug = location.hostname.split('.')[0]
  root.innerHTML = `<style>
  :host { all: initial; position: fixed; z-index: 2147483647; --gap: 12px;
    --paper: #fffdf8; --ink: #1c1917; --muted: #78716c; --line: rgba(28,25,23,.12);
    --hover: #f5f0e6; --boundary: #b45309; --stop: #b91c1c; --focus: #5e6ad2;
    color-scheme: light dark; color: var(--ink);
    font: 13px/1.4 ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif }
  @media (prefers-color-scheme: dark) { :host { --paper: #1c1917; --ink: #fafaf9;
    --muted: #a8a29e; --line: rgba(250,250,249,.12); --hover: #292524; --boundary: #fbbf24;
    --stop: #f87171 } }
  :host([data-corner^=top]) { top: var(--gap) } :host([data-corner^=bottom]) { bottom: var(--gap) }
  :host([data-corner$=left]) { left: var(--gap) } :host([data-corner$=right]) { right: var(--gap) }
  * { box-sizing: border-box }
  button, a { all: unset; cursor: pointer }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }
  .ring { display: block; flex: none }
  .busy .ring { animation: march 1.2s linear infinite }
  @keyframes march { to { rotate: 1turn } }

  /* At rest only the boundary mark shows; hover, focus, open or busy unrolls the name beside it.
     In a right-hand corner it unrolls leftwards, so the mark never leaves its corner. */
  .pill { display: flex; align-items: center; height: 30px; padding: 0 6px;
    border: 1px solid var(--line); border-radius: 9999px; background: var(--paper);
    color: var(--boundary); font-size: 12px; box-shadow: 0 4px 14px -6px rgba(28,25,23,.4);
    touch-action: none; user-select: none }
  :host([data-corner$=right]) .pill { flex-direction: row-reverse }
  .label { display: flex; gap: 5px; max-width: 0; overflow: hidden; opacity: 0;
    white-space: nowrap; transition: max-width .2s ease-out, opacity .15s, padding .2s ease-out }
  .pill:hover .label, .pill:focus-visible .label, .pill[aria-expanded=true] .label,
  .pill.busy .label { max-width: 180px; opacity: 1; padding: 0 6px }
  .slug { font-weight: 650; color: var(--ink) }
  .lan { font-weight: 500 }

  .card { position: absolute; width: 248px; padding: 14px; border: 1px solid var(--line);
    border-radius: 14px; background: var(--paper);
    box-shadow: 0 18px 40px -16px rgba(28,25,23,.45);
    transition: opacity .14s, translate .14s, visibility .14s }
  .card[hidden] { display: block !important; opacity: 0; visibility: hidden; pointer-events: none }
  :host([data-corner^=bottom]) .card { bottom: calc(100% + 8px) }
  :host([data-corner^=top]) .card { top: calc(100% + 8px) }
  :host([data-corner^=bottom]) .card[hidden] { translate: 0 4px }
  :host([data-corner^=top]) .card[hidden] { translate: 0 -4px }
  :host([data-corner$=left]) .card { left: 0 } :host([data-corner$=right]) .card { right: 0 }

  h2 { all: unset; display: block; font-size: 15px; font-weight: 650; line-height: 1.25;
    overflow-wrap: anywhere }
  .state { margin-top: 2px; color: var(--muted); font-size: 12px;
    font-variant-numeric: tabular-nums; min-height: 1.4em }
  .state.error { color: var(--stop) }
  .actions { display: flex; gap: 6px; margin-top: 12px }
  .actions button { flex: 1; padding: 7px 0; border-radius: 8px; text-align: center;
    font-weight: 600; border: 1px solid var(--line) }
  .actions button:hover { background: var(--hover) }
  .actions .restart { background: var(--ink); color: var(--paper); border-color: var(--ink) }
  .actions .restart:hover { background: var(--ink); opacity: .88 }
  .actions .stop:hover { color: var(--stop); border-color: currentColor; background: none }
  .actions button:disabled { opacity: .45; cursor: default }
  .legend { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding-top: 10px;
    border-top: 1px solid var(--line); color: var(--boundary); font-size: 12px }
  .legend i { flex: none; width: 22px; border-top: 1.5px dashed currentColor }
  .foot { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px }
  .foot a { font-weight: 600 } .foot a:hover { text-decoration: underline }
  .foot .hide { color: var(--muted) } .foot .hide:hover { color: var(--ink) }
  [hidden] { display: none !important }
  @media (prefers-reduced-motion: reduce) { .card, .label { transition: none } .busy .ring { animation: none } }
  @media print { :host { display: none } }
</style>
<button class="pill" aria-expanded="false" aria-haspopup="dialog"
  title="Only reachable on your home network. Click for atlas, drag to move.">
  ${ring}<span class="label"><span class="slug"></span><span class="lan">LAN</span></span>
</button>
<div class="card" role="dialog" aria-label="atlas" hidden>
  <h2 class="name"></h2>
  <div class="state" role="status">Asking atlas…</div>
  <div class="actions">
    <button class="restart" data-action="restart" hidden>Restart</button>
    <button class="stop" data-action="stop" hidden>Stop</button>
  </div>
  <div class="legend"><i></i>Home network only</div>
  <div class="foot">
    <a class="console" target="_blank" rel="noopener" hidden>Open in atlas</a>
    <button class="hide">Hide in this tab</button>
  </div>
</div>`
  const $ = (s) => root.querySelector(s)
  const pill = $('.pill')
  const menu = $('.card')
  $('.slug').textContent = slug
  $('.name').textContent = slug
  let idle = 'Dev server state unknown'
  const say = (text, error = false) => {
    $('.state').textContent = text
    $('.state').classList.toggle('error', error)
  }

  const open = (on) => {
    menu.hidden = !on
    pill.setAttribute('aria-expanded', String(on))
  }
  host.dataset.corner = localStorage.getItem(CORNER) || 'bottom-left'

  // Drag the pill anywhere; on release it snaps to the nearest corner. The click that follows a
  // drag is swallowed, so only a real click (mouse, keyboard or assistive tech) toggles the menu.
  let drag = null
  let dragged = false
  pill.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    drag = { x: e.clientX, y: e.clientY, moved: false }
    dragged = false
    pill.setPointerCapture(e.pointerId)
  })
  pill.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    open(false)
    host.style.translate = `${dx}px ${dy}px`
  })
  pill.addEventListener('pointerup', (e) => {
    if (!drag) return
    dragged = drag.moved
    drag = null
    host.style.translate = ''
    if (!dragged) return
    const v = e.clientY < innerHeight / 2 ? 'top' : 'bottom'
    const h = e.clientX < innerWidth / 2 ? 'left' : 'right'
    host.dataset.corner = `${v}-${h}`
    localStorage.setItem(CORNER, host.dataset.corner)
  })
  pill.addEventListener('click', () => {
    if (dragged) dragged = false
    else open(menu.hidden)
  })
  document.addEventListener('pointerdown', (e) => {
    if (!e.composedPath().includes(host)) open(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) open(false)
  })

  $('.hide').addEventListener('click', () => {
    sessionStorage.setItem(HIDDEN, '1')
    keep.disconnect()
    wrap.remove()
  })

  call('GET')
    .then((p) => {
      $('.name').textContent = p.name
      idle = p.port ? `Dev server on port ${p.port}` : 'No port assigned yet'
      say(idle)
      $('.console').href = p.console
      $('.console').hidden = false
      $('[data-action=restart]').hidden = !p.canRestart
      $('[data-action=stop]').hidden = false
    })
    .catch((e) => say(e.message, true))

  const lock = (busy) => {
    for (const b of root.querySelectorAll('[data-action]')) b.disabled = busy
    pill.classList.toggle('busy', busy)
  }
  const done = {
    restart: () => location.reload(),
    stop: (r) => say(r.stopped ? 'Dev server stopped' : 'No dev server was running'),
  }
  const fail = (e) => {
    say(e.message, true)
    setTimeout(() => say(idle), 6000)
  }
  for (const button of root.querySelectorAll('[data-action]')) {
    const action = button.dataset.action
    button.addEventListener('click', () => {
      lock(true)
      say(action === 'restart' ? 'Restarting dev server…' : 'Stopping dev server…')
      call('POST', { action })
        .then(done[action], fail)
        .finally(() => lock(false))
    })
  }

  const wrap = document.createElement('script')
  wrap.type = 'atlas/toolbar' // never executed
  wrap.style.cssText = 'display:block;position:absolute'
  wrap.append(host)
  const keep = new MutationObserver(() => {
    if (!wrap.isConnected) document.body.append(wrap)
  })
  document.body.append(wrap)
  keep.observe(document.body, { childList: true })
})()
