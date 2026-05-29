export type ParsedSummarySection = {
  title: string
  lines: string[]
}

export type ParsedStandupSummary = {
  title: string
  metaLines: string[]
  sections: ParsedSummarySection[]
}

export const parseStandupSummary = (summary?: string | null): ParsedStandupSummary | null => {
  if (!summary) return null

  const sectionTitles = new Set([
    'Sprint Health',
    'Team Time',
    'Task Changes',
    'Estimation Check',
    'Due Date Watch',
    'Discussion Notes'
  ])

  const lines = summary.split(/\r?\n/)
  const metaLines: string[] = []
  const sections: ParsedSummarySection[] = []
  let title = 'Standup Summary'
  let currentSection: ParsedSummarySection | null = null

  lines.forEach((rawLine) => {
    const line = rawLine
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\*\*(.*)\*\*$/, '$1')
      .replace(/^[-•]\s*/, '')
      .trim()

    if (!line || line === '---' || line.startsWith('This report is compiled')) {
      return
    }

    if (/^Standup Summary:/i.test(line)) {
      title = line.replace(/^Standup Summary:\s*/i, '').trim() || title
      return
    }

    if (sectionTitles.has(line)) {
      currentSection = { title: line, lines: [] }
      sections.push(currentSection)
      return
    }

    if (!currentSection) {
      metaLines.push(line)
      return
    }

    currentSection.lines.push(line)
  })

  return { title, metaLines, sections }
}