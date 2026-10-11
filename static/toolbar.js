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
  // The pill's dashed outline is a map's boundary line and its glyph a dot inside one: this page
  // sits inside the home network. Only the pill is dashed; the menu stays quiet.
  const ring =
    '<svg width=14 height=14 viewBox="0 0 14 14" aria-hidden=true><circle cx=7 cy=7 r=5.5 ' +
    'fill=none stroke=currentColor stroke-width=1.5 stroke-dasharray="2.2 1.8"/>' +
    '<circle cx=7 cy=7 r=2 fill=currentColor /></svg>'
  root.innerHTML = `<style>
  :host { all: initial; position: fixed; z-index: 2147483647; --gap: 12px;
    --paper: #fff; --ink: #1c1917; --muted: #78716c; --line: rgba(28,25,23,.12);
    --hover: #f5f5f4; --boundary: #b45309; --focus: #5e6ad2; color-scheme: light dark;
    font: 13px/1.35 ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink) }
  @media (prefers-color-scheme: dark) { :host { --paper: #1c1917; --ink: #fafaf9;
    --muted: #a8a29e; --line: rgba(250,250,249,.14); --hover: #292524; --boundary: #fbbf24 } }
  :host([data-corner^=top]) { top: var(--gap) } :host([data-corner^=bottom]) { bottom: var(--gap) }
  :host([data-corner$=left]) { left: var(--gap) } :host([data-corner$=right]) { right: var(--gap) }
  * { box-sizing: border-box }
  button, a { all: unset; cursor: pointer }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }
  .pill { display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px 0 6px;
    border: 1.5px dashed var(--boundary); border-radius: 9999px; background: var(--paper);
    color: var(--boundary); font-size: 12px; font-weight: 600; letter-spacing: .01em;
    box-shadow: 0 1px 2px rgba(28,25,23,.1), 0 6px 16px -6px rgba(28,25,23,.25);
    touch-action: none; user-select: none }
  .pill svg { display: block }
  .menu { position: absolute; width: max-content; min-width: 232px; max-width: 300px;
    padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper);
    box-shadow: 0 12px 32px -8px rgba(28,25,23,.3); transition: opacity .12s, scale .12s, visibility .12s }
  .menu[hidden] { display: block !important; opacity: 0; scale: .96; visibility: hidden;
    pointer-events: none }
  :host([data-corner^=bottom]) .menu { bottom: calc(100% + 6px) }
  :host([data-corner^=top]) .menu { top: calc(100% + 6px) }
  :host([data-corner$=left]) .menu { left: 0; transform-origin: left }
  :host([data-corner$=right]) .menu { right: 0; transform-origin: right }
  .head { padding: 8px 10px 10px }
  .name { font-weight: 600; overflow-wrap: anywhere }
  .note { display: flex; align-items: center; gap: 5px; margin-top: 3px; color: var(--boundary);
    font-size: 12px }
  .menu button, .menu a { display: block; padding: 6px 10px; border-radius: 8px }
  .menu button:hover, .menu a:hover { background: var(--hover) }
  .menu button:disabled { opacity: .5; cursor: default }
  .hide { color: var(--muted) }
  .msg { padding: 4px 10px 6px; color: var(--muted); font-size: 12px } .msg:empty { display: none }
  hr { border: 0; border-top: 1px solid var(--line); margin: 4px 6px }
  [hidden] { display: none !important }
  @media (prefers-reduced-motion: reduce) { .menu { transition: none } }
  @media print { :host { display: none } }
</style>
<button class="pill" aria-expanded="false" aria-haspopup="menu"
  title="Only reachable on your home network. Click for atlas, drag to move.">
  ${ring}<span>LAN only</span>
</button>
<div class="menu" role="menu" hidden>
  <div class="head">
    <div class="name">This page</div>
    <div class="note">${ring}Works only on your home network</div>
  </div>
  <button role="menuitem" data-action="restart" hidden>Restart dev server</button>
  <button role="menuitem" data-action="stop" hidden>Stop dev server</button>
  <a role="menuitem" class="console" target="_blank" rel="noopener" hidden>Open in atlas</a>
  <div class="msg" role="status"></div>
  <hr>
  <button role="menuitem" class="hide">Hide in this tab</button>
</div>`
  const $ = (s) => root.querySelector(s)
  const pill = $('.pill')
  const menu = $('.menu')
  const say = (text) => {
    $('.msg').textContent = text
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
      $('.console').href = p.console
      $('.console').hidden = false
      $('[data-action=restart]').hidden = !p.canRestart
      $('[data-action=stop]').hidden = false
    })
    .catch((e) => say(e.message))

  const lock = (disabled) => {
    for (const b of root.querySelectorAll('[data-action]')) b.disabled = disabled
  }
  const done = {
    restart: () => location.reload(),
    stop: (r) => say(r.stopped ? 'Dev server stopped' : 'No dev server was running'),
  }
  for (const button of root.querySelectorAll('[data-action]')) {
    const action = button.dataset.action
    button.addEventListener('click', () => {
      lock(true)
      say(action === 'restart' ? 'Restarting dev server…' : 'Stopping dev server…')
      call('POST', { action })
        .then(done[action], (e) => say(e.message))
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
