import { statfsSync } from 'node:fs'
import { homedir } from 'node:os'
import { type DiskResult, diskJson } from '$lib/disk'
import type {
  Analysis,
  ArchiveVersion,
  DiskSettings,
  Pending,
  Problem,
  Scan,
  ScheduleStatus,
} from '$lib/disk-types'
import { errorMessage } from '$lib/format'
import type { PageServerLoad } from './$types'

/**
 * One `atlas disk … --json` per source, in parallel, each allowed to fail on its own (the
 * `/system` pattern). A job's end reloads all of it with `invalidateAll()`.
 */
export const load: PageServerLoad = async () => {
  const errors: string[] = []
  const read = <T>(args: string[]) =>
    diskJson(args)
      .then((r: DiskResult) => {
        if (r.exit === 'error') throw new Error(r.error ?? r.message ?? 'error')
        return (r.data ?? null) as T | null
      })
      .catch((e) => {
        errors.push(`${args.join(' ')}: ${errorMessage(e)}`)
        return null
      })
  const [analysis, scan, archives, settings, schedules, doctor, pending] = await Promise.all([
    read<Analysis>(['analyze', '--cached']),
    read<Scan>(['scan', '--cached']),
    read<ArchiveVersion[]>(['archives', 'list']),
    read<DiskSettings>(['config', 'get']),
    read<ScheduleStatus[]>(['schedule', 'status']),
    read<{ problems: Problem[] }>(['doctor']),
    read<Pending[]>(['recover', 'list']),
  ])
  const fs = statfsSync(homedir())
  return {
    freeBytes: fs.bavail * fs.bsize,
    analysis,
    scan,
    archives: archives ?? [],
    settings,
    schedules: schedules ?? [],
    problems: doctor?.problems ?? [],
    pending: pending ?? [],
    errors,
  }
}
