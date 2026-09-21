/** The CLI's `--json` data shapes (`atlas-cli/src/disk/types.ts` and friends), for the /disk page. */
import type { DiskItem } from './disk'

export interface ProjectRow {
  id: string
  path: string
  bytes: number
  ageDays: number | null
  ageFile: string | null
  lastCommit: string | null
  state: 'active' | 'inactive' | 'eligible'
  dirty: boolean
  push: 'pushed' | 'unpushed' | 'unknown' | 'no-git'
}
export interface Analysis {
  ranAt: string
  projects: ProjectRow[]
}
export interface ArchiveVersion {
  id: string
  project: string
  version: string
  bytes: number
  localBytes: number
  verified: boolean
  verifyNote?: string
  storage: 'local' | 'uploading' | 'uploaded' | 'cloud' | 'unknown' | 'na'
  createdAt: string
}
export type Risk = 'rebuildable' | 'reinstallable' | 'review'
export interface FolderRow {
  path: string
  bytes: number
  risk: Risk
  why: string
  restore: string
  inUse: string | null
  nested: boolean
}
export interface Scan {
  ranAt: string
  totalBytes: number
  folders: FolderRow[]
}
export interface Preview {
  path: string
  entries: string[]
  newest: { path: string; mtime: number }[]
}
export interface ScheduleStatus {
  job: 'scan' | 'trim'
  enabled: boolean
  at: string
  installed: boolean
  problem: string | null
  nextRun: string | null
  lastRun: { exit: number; finishedAt: string; log: string; result: string } | null
}
export interface Problem {
  severity: 'error' | 'warn' | 'info'
  what: string
  fix: string
}
export interface Operation {
  start: {
    id: string
    run: string
    at: string
    actor: string
    op: string
    item: string
    target?: string
    bytes?: number
  }
  steps: { phase: string }[]
  end?: {
    outcome: DiskItem['outcome']
    message?: string
    freed?: number
    details?: Record<string, unknown>
  }
}
export type Pending = Operation & { finish: string; undo: string }
export interface DiskSettings {
  devRoot: string
  activeDays: number
  archiveAgeDays: number
  archiveMinMB: number
  skipCategories: string[]
  archiveDir: string
  compression: number
  keepNewest: number | null
  scanMinMB: number
  autoCleanRebuildable: boolean
  rustSweep: boolean
  rustSweepDays: number
  rustSweepMax: number
  stepTimeoutSec: number
  notifyTotalGB: number
  notifyGrowthGB: number
}
