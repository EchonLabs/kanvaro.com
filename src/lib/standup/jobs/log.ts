import type { JobResult } from './registry'

export interface JobLogInput {
  result: JobResult
  durationMs: number
  ok: boolean
}

/**
 * One line of NFR-16 structured log output.
 *
 * JSON on a single line so `docker logs` stays greppable and a log shipper can
 * parse it without a multiline rule.
 */
export function buildJobLogLine({ result, durationMs, ok }: JobLogInput): string {
  return JSON.stringify({
    event: 'standup.job.run',
    at: new Date().toISOString(),
    job: result.job,
    ok,
    durationMs,
    scannedProjects: result.scannedProjects,
    created: result.created,
    skipped: result.skipped,
    repaired: result.repaired,
    errorCount: result.errors.length,
    errors: result.errors
  })
}

const pad = (value: string, width: number) => value.padEnd(width)

/**
 * The same facts as {@link buildJobLogLine}, laid out for a person reading a
 * terminal: one aligned line per run, with created / repaired / errors shown
 * only when non-zero so an idle tick stays quiet to scan.
 */
export function buildPrettyJobLogLine({ result, durationMs, ok }: JobLogInput): string {
  const time = new Date().toISOString().slice(11, 19)
  const projects = `${result.scannedProjects} ${result.scannedProjects === 1 ? 'project' : 'projects'}`

  const parts = [`${pad(projects, 11)} ${String(result.skipped).padStart(3)} skipped`]
  if (result.created) parts.push(`${result.created} created`)
  if (result.repaired) parts.push(`${result.repaired} repaired`)
  if (result.errors.length) parts.push(`${result.errors.length} errors`)
  parts.push(`${durationMs} ms`)

  const lines = [`${time}  ${ok ? '✓' : '✗'} ${pad(result.job, 24)} ${parts.join('  ')}`]
  for (const error of result.errors) {
    lines.push(`          ↳ ${error.projectId}: ${error.message}`)
  }
  return lines.join('\n')
}

/**
 * Readable lines when a person is watching a terminal; single-line JSON
 * (NFR-16) whenever stdout is piped, redirected or captured by `docker logs`
 * and log shippers, which is where the parser-friendly form matters.
 */
export function logJobRun(input: JobLogInput): void {
  const line = process.stdout.isTTY ? buildPrettyJobLogLine(input) : buildJobLogLine(input)
  // eslint-disable-next-line no-console -- NFR-16: this IS the observability surface.
  console.log(line)
}
