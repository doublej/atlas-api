import { error } from '@sveltejs/kit'
import { hostnamesByPath } from '$lib/caddyDev'
import { projectHref, slashed, type Twin } from '$lib/components/projectpage/href'
import { ATLAS_TEMPLATES_DIR, DEV_FOLDER } from '$lib/config'
import { getGitStatus, type Project, scan } from '$lib/scanner'
import { readTemplateVersions } from '$lib/templates'
import type { PageServerLoad } from './$types'

/**
 * One project's full record, by `relativePath`. The local one wins over a remote twin with the
 * same path unless `?host=` asks for that host; every other copy is linked as a twin.
 */
export const load: PageServerLoad = async ({ params, url }) => {
  const [atlas, templateVersions, hostnames] = await Promise.all([
    scan(DEV_FOLDER, { skipGit: true }),
    readTemplateVersions(ATLAS_TEMPLATES_DIR),
    hostnamesByPath(),
  ])
  const host = url.searchParams.get('host')
  const matches = atlas.projects.filter((p) => slashed(p.relativePath) === slashed(params.path))
  const project =
    matches.find((p) => p.host === host) ?? matches.find((p) => p.isLocal) ?? matches[0]
  if (!project) error(404, `No project at ${params.path}`)

  const byHostPath = new Map(atlas.projects.map((p) => [`${p.host}:${p.path}`, p]))
  const linked = [
    ...matches.filter((p) => p !== project),
    ...(project.alsoOn ?? []).flatMap((t) => byHostPath.get(`${t.host}:${t.path}`) ?? []),
  ]
  const twins: Twin[] = [...new Map(linked.map((p) => [`${p.host}:${p.path}`, p])).values()].map(
    (p) => ({ host: p.host, path: p.path, href: projectHref(p.relativePath, p.host) }),
  )

  // Previous / next in catalog order, on the same machine.
  const siblings = atlas.projects
    .filter((p) => p.host === project.host)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  const at = siblings.indexOf(project)
  const link = (p?: Project) =>
    p && { name: p.name, href: projectHref(p.relativePath, p.isLocal ? undefined : p.host) }

  const chip = hostnames[project.path]
  return {
    project,
    // Fresh for the one project on this machine: one git spawn, branch + dirty + flow.
    git: project.isLocal ? await getGitStatus(project.path).catch(() => null) : null,
    twins,
    prev: link(siblings[at - 1]),
    next: link(siblings[at + 1]),
    folders: atlas.folders,
    baseDir: atlas.baseDir,
    templateVersions,
    hostnames: chip ? { [project.path]: chip } : {},
  }
}
