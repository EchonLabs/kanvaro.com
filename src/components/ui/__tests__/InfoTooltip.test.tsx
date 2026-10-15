/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { InfoTooltip } from '../InfoTooltip'
import { TooltipProvider } from '@/components/ui/tooltip'

function renderTooltip(props: Partial<React.ComponentProps<typeof InfoTooltip>> = {}) {
  return render(
    <TooltipProvider>
      <InfoTooltip content="This explains the reason." {...props} />
    </TooltipProvider>
  )
}

describe('InfoTooltip', () => {
  it('always renders the sr-only span with the given id and matching text', () => {
    renderTooltip({ id: 'reason-1' })

    const srOnly = document.getElementById('reason-1')
    expect(srOnly).not.toBeNull()
    expect(srOnly).toHaveTextContent('This explains the reason.')
    expect(srOnly).toHaveClass('sr-only')
  })

  it('does not render an sr-only span when no id is provided', () => {
    const { container } = renderTooltip()

    expect(container.querySelector('.sr-only')).toBeNull()
  })

  it('gives the tooltip trigger button an aria-label matching the content', () => {
    renderTooltip({ id: 'reason-2', content: 'Blocked because the sprint has not started.' })

    const trigger = screen.getByRole('button', { name: 'Blocked because the sprint has not started.' })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-label', 'Blocked because the sprint has not started.')
  })
})
