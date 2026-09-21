import { describe, expect, it } from 'vitest'
import { devFlags, parseListeners, parseNetstat, pickPort } from './ports'

describe('parseListeners', () => {
  it('reads addresses and folds both stacks of one port together', () => {
    const out = 'p1\nf6\nn*:5188\np2\nf14\nn127.0.0.1:8787\nf15\nn[::1]:8787\n'
    expect(parseListeners(out).sort((a, b) => a.port - b.port)).toEqual([
      { port: 5188, lanReachable: true },
      { port: 8787, lanReachable: false },
    ])
  })

  it('counts a port as reachable when any of its binds is', () => {
    expect(parseListeners('n127.0.0.1:3000\nn0.0.0.0:3000\n')).toEqual([
      { port: 3000, lanReachable: true },
    ])
  })
})

describe('pickPort', () => {
  const vite = { port: 5188, lanReachable: true }
  const workerd = { port: 8787, lanReachable: false }

  it('ignores a loopback-only listener when a reachable one exists', () => {
    expect(pickPort([workerd, vite], 4113)).toEqual(vite)
  })

  it('keeps the port atlas asked for when the server honoured it', () => {
    const asked = { port: 4113, lanReachable: true }
    expect(pickPort([asked, vite], 4113)).toEqual(asked)
  })

  it('falls back to the lowest reachable port', () => {
    expect(pickPort([{ port: 8000, lanReachable: true }, vite], 4113)).toEqual(vite)
  })

  it('surfaces a loopback-only server rather than nothing', () => {
    expect(pickPort([workerd], 4113)).toEqual(workerd)
  })

  it('returns null when nothing is bound', () => {
    expect(pickPort([], 4113)).toBeNull()
  })
})

describe('devFlags', () => {
  it('gives a plain script both flags', () => {
    expect(devFlags('vite dev', 4101)).toEqual(['--port', '4101', '--host', '0.0.0.0'])
    expect(devFlags(undefined, 4101)).toEqual(['--port', '4101', '--host', '0.0.0.0'])
  })
  it('gives a fan-out script nothing', () => {
    expect(devFlags('concurrently --kill-others "bun run a" "bun run b"', 4101)).toEqual([])
  })
  it('still adds --host to a script that pins its own port', () => {
    expect(devFlags('vite dev --port 5188', 4101)).toEqual(['--host', '0.0.0.0'])
  })
  it('still adds --port to a script that sets its own host', () => {
    expect(devFlags('next dev -H 0.0.0.0', 4101)).toEqual(['--port', '4101'])
    expect(devFlags('vite dev --host --port 5185', 4101)).toEqual([])
  })
})

describe('parseNetstat', () => {
  it('reads LISTEN rows, including process names with spaces and IPv6 binds', () => {
    const out = [
      'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options',
      'tcp4       0      0  127.0.0.1.16494        *.*                    LISTEN                 0            0  131072  131072 Adobe Desktop Se:5822   00000 0000020f 0000000000005c85',
      'tcp46      0      0  *.5185                 *.*                    LISTEN                 0            0  131072  131072             node:33772  00100 00000106 0000000001818982',
      'tcp6       0      0  ::1.4190               *.*                    LISTEN                 0            0  131072  131072          swift:99926  00100 00000106 0000000001818982',
      'tcp4       0      0  192.168.1.5.52100      1.2.3.4.443            ESTABLISHED         7810         7819  131072  132104           claude:89424  00102 00000008 000000000181e353',
    ].join('\n')
    expect(parseNetstat(out)).toEqual([
      { address: '127.0.0.1', port: 16494, command: 'Adobe Desktop Se', pid: 5822 },
      { address: '*', port: 5185, command: 'node', pid: 33772 },
      { address: '::1', port: 4190, command: 'swift', pid: 99926 },
    ])
  })
})
