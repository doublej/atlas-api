import type { Project } from './scanner'

/**
 * The fields the "/" list, its filters and its collapsed rows read. The page data carries only
 * these; the rest of a record (scripts and just recipes alone are 44% of the catalog) loads when a
 * row opens (`GET /api/projects?path=`). Full records sent with every page view made it 1.45MB.
 */
const SUMMARY_KEYS = [
  'name',
  'slug',
  'path',
  'relativePath',
  'host',
  'isLocal',
  'description',
  'readme',
  'type',
  'framework',
  'runner',
  'modifiedAt',
  'devCommand',
  'git',
  'gitBranch',
  'hasJustfile',
  'promotion',
  'domains',
  'agentFiles',
] as const satisfies readonly (keyof Project)[]

export type ProjectSummary = Pick<Project, (typeof SUMMARY_KEYS)[number]>

export function summarizeProject(p: Project): ProjectSummary {
  return Object.fromEntries(
    SUMMARY_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]),
  ) as ProjectSummary
}
