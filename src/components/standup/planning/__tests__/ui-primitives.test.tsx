/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { AlertTriangle } from 'lucide-react'

import * as gravatar from '@/lib/gravatar'

import {
  PlanBanner,
  PlanCard,
  PlanAvatar,
  PlanCount,
  initialsOf,
  MovePicker,
  PlanRow,
  PlanTaskCard,
  planPillClass
} from '@/components/standup/planning/ui'

jest.mock('@/lib/gravatar', () => {
  const actual = jest.requireActual('@/lib/gravatar')
  return { ...actual, getAvatarData: jest.fn(actual.getAvatarData) }
})

describe('planPillClass', () => {
  it('maps each tone to its own plan token rather than a raw colour', () => {
    expect(planPillClass('danger')).toContain('text-[var(--plan-danger)]')
    expect(planPillClass('success')).toContain('text-[var(--plan-success)]')
    expect(planPillClass('warning')).toContain('text-[var(--plan-warning)]')
    expect(planPillClass('accent')).toContain('--plan-accent-ink')
    expect(planPillClass('neutral')).toContain('--plan-muted')
  })

  it('appends a caller class', () => {
    expect(planPillClass('neutral', 'ml-1')).toContain('ml-1')
  })
})

describe('PlanCount', () => {
  it('renders nothing at zero, because a grey 0 beside every heading is noise', () => {
    const { container } = render(<PlanCount count={0} label="3 overdue blockers" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the count with a screen-reader label', () => {
    render(<PlanCount count={3} label="3 overdue blockers" />)
    expect(screen.getByTestId('issue-count')).toHaveTextContent('3')
    expect(screen.getByText('3 overdue blockers')).toBeInTheDocument()
  })

  it('contributes nothing to the accessibility tree when the caller already shows the label', () => {
    render(<PlanCount count={3} label="3 overdue blockers" decorative />)
    expect(screen.getByTestId('issue-count')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText('3 overdue blockers')).not.toBeInTheDocument()
  })
})

describe('PlanRow', () => {
  it('renders the title, the meta line and the badge', () => {
    render(<PlanRow title="KAN-12" meta="2.0 h" badge={<span>Blocked</span>} />)
    expect(screen.getByText('KAN-12')).toBeInTheDocument()
    expect(screen.getByText('2.0 h')).toBeInTheDocument()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
  })

  it('omits the meta line when there is none', () => {
    const { container } = render(<PlanRow title="KAN-12" />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})

describe('PlanCard heading wiring', () => {
  it('defaults to an h2 with no id, so existing callers are unchanged', () => {
    const { container } = render(
      <PlanCard title="Sprint goal">
        <p>body</p>
      </PlanCard>
    )
    const heading = container.querySelector('h2')
    expect(heading).toHaveTextContent('Sprint goal')
    expect(heading).not.toHaveAttribute('id')
  })

  it('renders the requested level and id so a section can label itself', () => {
    render(
      <section aria-labelledby="panel-6-heading">
        <PlanCard title="Blockers" headingLevel="h3" headingId="panel-6-heading">
          <p>body</p>
        </PlanCard>
      </section>
    )
    // The accessible name resolves only if the id landed on the heading.
    expect(screen.getByRole('region', { name: 'Blockers' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Blockers' })).toHaveAttribute(
      'id',
      'panel-6-heading'
    )
  })
})

describe('PlanBanner', () => {
  it('supports a danger tone on the module red', () => {
    render(
      <PlanBanner tone="danger" icon={<AlertTriangle />}>
        A previous completion died mid-saga.
      </PlanBanner>
    )
    const banner = screen.getByRole('status')
    expect(banner.className).toContain('--plan-danger-bg')
    // The danger ink lands on the icon span, closing bracket included.
    expect(banner.querySelector('span[aria-hidden]')!.className).toContain(
      'text-[var(--plan-danger)]'
    )
  })

  it('draws a border only when asked', () => {
    const { container: plain } = render(
      <PlanBanner tone="info" icon={<AlertTriangle />}>
        x
      </PlanBanner>
    )
    const { container: bordered } = render(
      <PlanBanner tone="info" icon={<AlertTriangle />} bordered>
        x
      </PlanBanner>
    )
    expect(plain.firstElementChild!.className).not.toContain('border-[var(--plan-accent)]')
    expect(bordered.firstElementChild!.className).toContain('border-[var(--plan-accent)]')
  })

  it('renders the icon it is given, hidden from assistive tech', () => {
    render(
      <PlanBanner tone="danger" icon={<svg data-testid="banner-icon" />}>
        x
      </PlanBanner>
    )
    const icon = screen.getByTestId('banner-icon')
    expect(icon).toBeInTheDocument()
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('can announce itself as an alert for a blocking condition', () => {
    render(
      <PlanBanner tone="danger" icon={<AlertTriangle />} role="alert">
        blocked
      </PlanBanner>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('MovePicker, shared by both assignment surfaces', () => {
  const team = [
    { memberId: 'm1', name: 'Ana', onSprintTeam: true, role: 'developer' },
    { memberId: 'm2', name: 'Ben', onSprintTeam: true, role: 'developer' }
  ] as any[]
  const qa = [{ memberId: 'm3', name: 'Cass', onSprintTeam: false, role: 'qa' }] as any[]

  it('offers the team, an unassigned option, and QA under a group that says what picking them does', () => {
    render(
      <MovePicker
        task={{ _id: 't1', title: 'Login form' }}
        value="m1"
        teamOptions={team}
        qaOptions={qa}
        busy={false}
        onChange={() => {}}
      />
    )
    const select = screen.getByLabelText('Assign Login form to')
    expect(select).toHaveValue('m1')
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument()
    // The group label is the warning that picking a QA changes the roster.
    expect(
      select.querySelector('optgroup')!.getAttribute('label')
    ).toContain('will be added to the sprint team')
  })

  it('reports the chosen member, and null for unassigned', () => {
    const onChange = jest.fn()
    render(
      <MovePicker
        task={{ _id: 't1', title: 'Login form' }}
        value="m1"
        teamOptions={team}
        qaOptions={[]}
        busy={false}
        onChange={onChange}
      />
    )
    const select = screen.getByLabelText('Assign Login form to')
    fireEvent.change(select, { target: { value: 'm2' } })
    expect(onChange).toHaveBeenCalledWith('m2')
    fireEvent.change(select, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('is inert while a write is in flight', () => {
    render(
      <MovePicker
        task={{ _id: 't1', title: 'Login form' }}
        value={null}
        teamOptions={team}
        qaOptions={[]}
        busy
        onChange={() => {}}
      />
    )
    expect(screen.getByLabelText('Assign Login form to')).toBeDisabled()
  })
})

describe('PlanTaskCard', () => {
  it('stays one line when there is no footer, as the planning board needs', () => {
    const { container } = render(<PlanTaskCard taskKey="KAN-12" title="Login form" meta="2.0 h" />)
    const card = container.firstElementChild!
    // `min-h-9` sits on the first ROW, not the card: a card with a footer
    // must grow rather than squash both rows into 36px. So the row keeps the
    // one-line height and the card itself has none.
    expect(card.firstElementChild!.className).toContain('min-h-9')
    expect(card.className).not.toContain('min-h-9')
    expect(card.querySelector('[data-testid="task-card-footer"]')).toBeNull()
  })

  it('renders nothing for a footer that is null, so a bare task gets no empty strip', () => {
    const { container } = render(
      <PlanTaskCard taskKey="KAN-12" title="Login form" meta="2.0 h" footer={null} />
    )
    expect(container.querySelector('[data-testid="task-card-footer"]')).toBeNull()
  })

  it('renders a second row when the surface has more to show', () => {
    render(
      <PlanTaskCard
        taskKey="KAN-12"
        title="Login form"
        meta="2.0 h"
        footer={<span>critical</span>}
      />
    )
    expect(screen.getByTestId('task-card-footer')).toHaveTextContent('critical')
  })

  it('colours the task key with the contrast-stepped accent ink, not the raw accent', () => {
    const { container } = render(<PlanTaskCard taskKey="KAN-12" title="Login form" meta="2.0 h" />)
    const key = screen.getByText('KAN-12')
    expect(key.className).toContain('--plan-accent-ink')
    expect(container.innerHTML).not.toContain('text-[var(--plan-accent)]')
  })
})

describe('PlanAvatar', () => {
  // `GravatarAvatar` honours whatever options it is handed (its own suite
  // proves that); this pins that PlanAvatar hands it the identicon default, so
  // an unregistered email gets a recognisable face rather than Gravatar's
  // blank silhouette on every screen that uses it.
  const spy = gravatar.getAvatarData as jest.Mock

  beforeEach(() => spy.mockClear())

  it('asks for the identicon default at the size it was given', () => {
    render(<PlanAvatar member={{ name: 'Ana Pereira', email: 'ana@example.com' }} size={44} />)

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@example.com' }),
      expect.objectContaining({ default: 'identicon', size: 44 })
    )
  })

  it('defaults to 32px when no size is passed', () => {
    render(<PlanAvatar member={{ name: 'Ana Pereira', email: 'ana@example.com' }} />)

    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ default: 'identicon', size: 32 })
    )
  })
})

describe('initialsOf', () => {
  it('takes the first letter of each of two words', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
  })

  it('takes the first and the LAST word when there are three or more', () => {
    expect(initialsOf('Ada Lovelace King')).toBe('AK')
  })

  it('takes the first two characters of a single word', () => {
    expect(initialsOf('Cher')).toBe('CH')
  })

  it('falls back to ? for an empty or whitespace-only name', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })
})
