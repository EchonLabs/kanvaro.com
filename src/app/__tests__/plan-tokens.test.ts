/**
 * The stylesheet contract for the planning palette.
 *
 * These are not style assertions — they pin the two invariants from the spec
 * that nothing else can catch: every accent theme must define its own
 * contrast-stepped ink, and a printed summary must not clip its scroll boxes.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const LIGHT_SURFACE = '#FFFFFF'
const DARK_SURFACE = '#1C1C1E'

/** The body of a rule whose selector is exactly `selector`. */
function blockBody(css: string, selector: string): string | null {
  const at = css.indexOf(selector)
  if (at === -1) return null
  const open = css.indexOf('{', at)
  if (open === -1) return null
  // Theme blocks hold only declarations, so the first '}' closes them.
  const close = css.indexOf('}', open)
  if (close === -1) return null
  // Reject a partial hit on a longer selector that merely contains this
  // one — e.g. finding `[data-theme="red"]` inside `.dark[data-theme="red"]`.
  if (!/^\s*$/.test(css.slice(at + selector.length, open))) return null
  return css.slice(open + 1, close)
}

/** Light-variant `[data-theme="x"]` selectors, excluding the `.dark` compounds. */
function lightThemeSelectors(css: string): string[] {
  const found = new Set<string>()
  let i = 0
  for (;;) {
    const at = css.indexOf('[data-theme="', i)
    if (at === -1) break
    const end = css.indexOf('"]', at)
    const name = css.slice(at + 13, end)
    if (!css.slice(Math.max(0, at - 5), at).endsWith('.dark')) found.add(name)
    i = end + 2
  }
  return Array.from(found)
}

/** Every body of a rule with exactly this selector (a selector may repeat). */
function allBlockBodies(css: string, selector: string): string[] {
  const out: string[] = []
  let i = 0
  for (;;) {
    const at = css.indexOf(selector, i)
    if (at === -1) break
    const rest = css.slice(at)
    const body = blockBody(rest, selector)
    if (body !== null) out.push(body)
    i = at + selector.length
  }
  return out
}

const EXPECTED: Record<string, { light: string; dark: string }> = {
  orange: { light: '#BD5A00', dark: '#FF7A00' },
  purple: { light: '#8854CC', dark: '#A067E9' },
  red: { light: '#8E1018', dark: '#FF8085' }
}

const declaresInk = (body: string | null, value: string) =>
  body !== null &&
  new RegExp(`--plan-accent-ink:[ ]*${value}(?![0-9A-Fa-f])`, 'i').test(body)

describe('--plan-accent-ink', () => {
  it('is declared for every accent theme with its own value, so a new theme cannot inherit a mismatched ink', () => {
    const themes = lightThemeSelectors(css)
    expect(themes.length).toBeGreaterThan(0)

    for (const theme of themes) {
      const expected = EXPECTED[theme]
      if (!expected) throw new Error(`Accent theme "${theme}" has no entry in EXPECTED`)

      const light = blockBody(css, `[data-theme="${theme}"]`)
      const dark = blockBody(css, `.dark[data-theme="${theme}"]`)
      expect({ theme, light: declaresInk(light, expected.light) }).toEqual({ theme, light: true })
      expect({ theme, dark: declaresInk(dark, expected.dark) }).toEqual({ theme, dark: true })
    }
  })

  const INKS: Array<[string, string, string]> = [
    ['blue light', '#0A6CFF', LIGHT_SURFACE],
    ['blue dark', '#3D8EFF', DARK_SURFACE],
    ['orange light', '#BD5A00', LIGHT_SURFACE],
    ['orange dark', '#FF7A00', DARK_SURFACE],
    ['purple light', '#8854CC', LIGHT_SURFACE],
    ['purple dark', '#A067E9', DARK_SURFACE],
    ['red light', '#8E1018', LIGHT_SURFACE],
    ['red dark', '#FF8085', DARK_SURFACE]
  ]

  it.each(INKS)('clears 4.5:1 as text — %s', (_label, ink, surface) => {
    expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('stays distinguishable from --plan-danger under the red accent theme', () => {
    // At the bare 4.5:1 floor the red theme's ink lands on #E3282B, which is
    // 1.18:1 against danger #D70015 — indistinguishable. The spec steps it
    // harder on purpose; this is the floor that step has to clear.
    expect(contrast('#8E1018', '#D70015')).toBeGreaterThanOrEqual(1.4)
    expect(contrast('#FF8085', '#FF453A')).toBeGreaterThanOrEqual(1.4)
  })

  it('is declared in the base :root block and its dark override', () => {
    const root = allBlockBodies(css, ':root')
    expect(root.some((b) => declaresInk(b, '#0A6CFF'))).toBe(true)
    const dark = allBlockBodies(css, '.dark')
    expect(dark.some((b) => declaresInk(b, '#3D8EFF') && /--plan-secondary:\s*#D1D1D6/i.test(b))).toBe(true)
  })
})

describe('.plan-scroll', () => {
  it('releases its height cap when printed, so a summary prints in full', () => {
    const printBlocks = css.match(/@media print\s*\{[\s\S]*?\n\}/g) ?? []
    const releasesPlanScroll = printBlocks.some(
      (block) => block.includes('.plan-scroll') && block.includes('max-height: none')
    )
    expect(releasesPlanScroll).toBe(true)
  })
})
