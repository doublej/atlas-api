import type { Listener } from '$lib/listeners'

/** Ports macOS itself listens on, by the name System Settings › Sharing gives the service. */
export const MACOS_PORTS: Record<number, string> = {
  22: 'Remote Login (SSH)',
  88: 'Kerberos',
  445: 'File Sharing (SMB)',
  548: 'File Sharing (AFP)',
  631: 'Printer Sharing',
  3283: 'Remote Management',
  3689: 'Media Sharing',
  5000: 'AirPlay Receiver',
  5900: 'Screen Sharing',
  7000: 'AirPlay Receiver',
  62078: 'iPhone sync',
}

/** The macOS service behind a port nobody else claims: a Flask project on 5000 is that project. */
export const macosName = (l: Pick<Listener, 'group' | 'port'>): string | undefined =>
  l.group === 'system' ? MACOS_PORTS[l.port] : undefined
