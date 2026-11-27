/**
 * Task 4.2: every tool description follows the same format and stays short, refers only to
 * tools that exist, and (once a tool is built) its example input is valid for that tool.
 */
import { describe, expect, it } from 'vitest'
import type { ToolDescription } from '../src/tools/descriptions.js'
import { DESCRIPTIONS, descriptionOf, formatDescription } from '../src/tools/descriptions.js'
import { tools } from '../src/tools/index.js'

const entries = Object.entries(DESCRIPTIONS) as [keyof typeof DESCRIPTIONS, ToolDescription][]

describe('tool descriptions', () => {
  it('cover all 28 wave-1 read tools', () => {
    expect(entries).toHaveLength(28)
  })

  it.each(entries)('%s follows the format', (name, d) => {
    expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    expect(d.does).toMatch(/^(Lists|Gets|Shows|Searches) .+\.$/)
    expect(d.when).toMatch(/^Use it .+\.$/)
    expect(d.cannot).toMatch(/^It cannot .+\.$/)
    for (const part of [d.does, d.when, d.cannot]) expect(part.length).toBeLessThanOrEqual(220)
    const text = formatDescription(d)
    expect(text.split('\n')).toHaveLength(4)
    expect(text.length).toBeLessThanOrEqual(650)
    expect(descriptionOf(name)).toBe(text)
  })

  it.each(entries)('%s mentions only tools that exist', (_name, d) => {
    const mentioned = `${d.does} ${d.when} ${d.cannot}`.match(/\b[a-z]+_(?:list|get|tasks|events|standup|health)\b/g) ?? []
    for (const m of mentioned) expect(Object.keys(DESCRIPTIONS)).toContain(m)
  })

  it('uses the shared input names, never Kanvaro\'s own or identity fields', () => {
    for (const [, d] of entries) {
      for (const key of Object.keys(d.example)) {
        expect(['project', 'sprint', 'story', 'epic', 'assignedTo', 'startDate', 'endDate', 'organizationId', 'userId']).not.toContain(key)
      }
    }
  })
})

describe('built tools', () => {
  // Empty until the read tools land (4.3); then every one is checked here.
  it('use their reviewed description, with an example valid for their schema', () => {
    for (const tool of tools) {
      const d = (DESCRIPTIONS as Record<string, ToolDescription | undefined>)[tool.name]
      expect(d, `no description for ${tool.name} in descriptions.ts`).toBeDefined()
      if (!d) continue
      expect(tool.description, tool.name).toBe(formatDescription(d))
      expect(tool.schema.safeParse(d.example).success, `${tool.name} example`).toBe(true)
    }
  })
})
