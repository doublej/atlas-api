import { describe, expect, it } from 'vitest'
import { jobState, parseLaunchctlList } from './launchctl'

const LIST = `PID\tStatus\tLabel
977\t0\tcom.jurrejan.atlas-api
-\t0\tcom.jurrejan.gui-path
-\t1\tcom.jurrejan.aw-backup
27009\t255\tcom.binwatch.tunnel
-\t-9\tcom.apple.progressd
`

describe('launchctl list', () => {
  const jobs = parseLaunchctlList(LIST)

  it('reads pid and last exit per label', () => {
    expect(jobs.get('com.jurrejan.atlas-api')).toEqual([977, 0])
    expect(jobs.get('com.jurrejan.gui-path')).toEqual([null, 0])
    expect(jobs.get('com.apple.progressd')).toEqual([null, -9])
    expect(jobs.size).toBe(5)
  })

  it('derives the state the daemons page shows', () => {
    expect(jobState(jobs, 'com.jurrejan.atlas-api')).toEqual({
      pid: 977,
      lastExitStatus: null,
      status: 'running',
    })
    expect(jobState(jobs, 'com.binwatch.tunnel').status).toBe('running')
    expect(jobState(jobs, 'com.jurrejan.aw-backup')).toEqual({
      pid: null,
      lastExitStatus: 1,
      status: 'error',
    })
    expect(jobState(jobs, 'com.jurrejan.gui-path').status).toBe('stopped')
    expect(jobState(jobs, 'com.jurrejan.gui-path', true).status).toBe('idle')
    expect(jobState(jobs, 'not.loaded', true)).toEqual({
      pid: null,
      lastExitStatus: null,
      status: 'stopped',
    })
  })
})
