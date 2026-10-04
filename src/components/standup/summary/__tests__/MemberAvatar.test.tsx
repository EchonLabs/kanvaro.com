/**
 * @jest-environment jsdom
 */
/**
 * Every member named on the summary gets a face, drawn by the planning
 * screen's `PlanAvatar` so a person looks the same here, on the run screen
 * and on the planning page.
 *
 * The persisted summary rows carry only a name, so `getSummary` joins the
 * user record on read. `avatarMember` hands whatever that join did or did not
 * find to `PlanAvatar`, which resolves a photo, then Gravatar with an
 * `identicon` default, then initials from the stored name.
 *
 * `PlanAvatar` is `aria-hidden` and carries no name of its own: every call
 * site renders the member's name as text beside it, so the face is never
 * announced twice. The `member-avatar` wrapper the call sites add is what
 * keeps the member identifiable (a `title`) without that.
 */
import { render, screen } from '@testing-library/react'

import { PlanAvatar } from '@/components/standup/planning/ui'
import { avatarMember } from '@/components/standup/summary/rows'

describe('avatarMember', () => {
  it('passes through the identity fields the summary join supplied', () => {
    expect(
      avatarMember(
        {
          firstName: 'Kasun',
          lastName: 'Perera',
          email: 'kasun@example.test',
          avatar: 'https://cdn.example.test/kasun.png'
        },
        'Kasun Perera'
      )
    ).toEqual({
      name: 'Kasun Perera',
      firstName: 'Kasun',
      lastName: 'Perera',
      email: 'kasun@example.test',
      avatar: 'https://cdn.example.test/kasun.png'
    })
  })

  it('leaves the identity empty when the join found no user, so PlanAvatar falls back to the name', () => {
    expect(avatarMember({}, 'Kasun Perera')).toEqual({
      name: 'Kasun Perera',
      firstName: undefined,
      lastName: undefined,
      email: undefined,
      avatar: undefined
    })
  })

  it('coerces a name that was not stored as a string', () => {
    // The sections that render `Mixed` rows (variance, debt) hand this a
    // value that is only a string by convention - a historical document
    // could hold anything there, and PlanAvatar calls `.trim()` on it.
    expect(avatarMember({}, 1234 as unknown as string).name).toBe('1234')
  })
})

describe('the summary screen avatar', () => {
  it('is decorative, because the member name is always rendered beside it', () => {
    const { container } = render(
      <PlanAvatar member={{ name: 'Ana Pereira', email: 'ana@example.com' }} size={32} />
    )
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('still renders a face for a member whose user record has gone', () => {
    const { container } = render(
      <PlanAvatar member={avatarMember({}, 'Ana Pereira')} size={32} />
    )
    expect(container.firstElementChild).not.toBeEmptyDOMElement()
  })

  it('falls back to initials from the stored name when there is no photo or email', () => {
    render(<PlanAvatar member={avatarMember({}, 'Kasun Perera')} size={28} />)
    expect(screen.getByText('KP')).toBeInTheDocument()
  })

  it('uses the last word as the surname for a three-part name', () => {
    render(<PlanAvatar member={avatarMember({}, 'Anessa van Doe')} size={28} />)
    expect(screen.getByText('AD')).toBeInTheDocument()
  })

  it('draws the neutral placeholder when there is no member at all', () => {
    const { container } = render(<PlanAvatar size={32} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
