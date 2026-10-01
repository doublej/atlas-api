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
