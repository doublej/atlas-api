// The atlas toolbar: the NAS Caddy appends this script to every HTML page of a project's LAN dev
// hostname (`renderSiteBlock`). It talks to `/api/toolbar` on the console, which acts only on the
// project this page's hostname names. Shadow DOM, so the page's CSS and ours never meet.
;(() => {
  if (window.top !== window || document.getElementById('atlas-toolbar')) return
  const api = `${new URL(document.currentScript.src).origin}/api/toolbar`
  const call = (method, body) =>
    fetch(api, {
      method,
      body: body && JSON.stringify(body),
      headers: body ? { 'Content-Type': 'text/plain' } : undefined,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      return data
    })

  const host = document.createElement('div')
  host.id = 'atlas-toolbar'
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `<style>
  :host { all: initial; position: fixed; right: 8px; bottom: 8px; z-index: 2147483647 }
  div { display: flex; gap: 4px; align-items: center; padding: 4px; border-radius: 6px;
    background: #111827; color: #f9fafb; font: 11px/1 system-ui, sans-serif; opacity: .92 }
  b { padding: 0 4px; font-weight: 600 }
  button, a { all: unset; cursor: pointer; padding: 4px 6px; border-radius: 4px; background: #374151 }
  button:hover, a:hover { background: #4b5563 }
  button:disabled { opacity: .5; cursor: default }
  [hidden] { display: none }
  .msg { padding: 0 4px; color: #fbbf24 }
</style><div>
  <b title="atlas">atlas</b><span class="name"></span>
  <span class="actions" hidden>
    <button data-action="restart" hidden>Restart</button>
    <button data-action="stop">Stop</button>
    <a target="_blank" rel="noopener">Console</a>
  </span>
  <span class="msg"></span>
</div>`
  const $ = (s) => root.querySelector(s)
  const say = (text) => {
    $('.msg').textContent = text
  }

  call('GET')
    .then((p) => {
      $('.name').textContent = p.name
      $('a').href = p.console
      $('[data-action=restart]').hidden = !p.canRestart
      $('.actions').hidden = false
    })
    .catch((e) => say(e.message))

  const lock = (disabled) => {
    for (const b of root.querySelectorAll('button')) b.disabled = disabled
  }
  const done = {
    restart: () => location.reload(),
    stop: (r) => say(r.stopped ? 'stopped' : 'nothing was running'),
  }

  for (const button of root.querySelectorAll('button')) {
    const action = button.dataset.action
    button.addEventListener('click', () => {
      lock(true)
      say(action === 'restart' ? 'restarting…' : 'stopping…')
      call('POST', { action })
        .then(done[action], (e) => say(e.message))
        .finally(() => lock(false))
    })
  }

  document.body.append(host)
})()
