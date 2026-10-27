/**
 * @jest-environment jsdom
 */
/**
 * `scrollToSection` — the run screen's "Fix" jumps.
 *
 * It used `scrollIntoView`, which scrolls every scrollable ancestor — the app
 * shell's `h-screen overflow-hidden` frame included — so a Fix click slid the
 * whole page up and left the fixed backdrop showing as a black bar. Only the
 * content area's own scroll container may move.
 */
import { scrollToSection } from '../ui'

describe('scrollToSection', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('scrolls only the nearest scroll container, never scrollIntoView', () => {
    document.body.innerHTML = `
      <div id="frame" style="overflow: hidden">
        <main id="main" style="overflow-y: auto">
          <section id="panel-3" tabindex="-1"></section>
        </main>
      </div>`
    const main = document.getElementById('main')!
    const frame = document.getElementById('frame')!
    const target = document.getElementById('panel-3')!

    // jsdom has no layout; give the container something to scroll.
    Object.defineProperty(main, 'scrollHeight', { value: 2000 })
    Object.defineProperty(main, 'clientHeight', { value: 600 })
    main.scrollTo = jest.fn()
    frame.scrollTo = jest.fn()
    target.scrollIntoView = jest.fn()

    scrollToSection('panel-3')

    expect(main.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    expect(frame.scrollTo).not.toHaveBeenCalled()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(target)
  })

  it('does nothing for an id that is not on the page', () => {
    expect(() => scrollToSection('panel-404')).not.toThrow()
  })
})
