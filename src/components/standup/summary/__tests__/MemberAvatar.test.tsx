/**
 * @jest-environment jsdom
 */
/**
 * Every member named on the summary gets a face.
 *
 * The persisted summary rows carry only a name, so `getSummary` joins the
 * user record on read — these tests cover the other half: that whatever the
 * join did or did not find still produces something to look at. A member with
 * an uploaded photo shows it; one with only an email gets a Gravatar, and an
 * `identicon` default so that a member who never registered with Gravatar
 * still gets a distinct image rather than the same grey silhouette as
 * everybody else; one the join could not resolve at all falls back to
 * initials taken from the name the stand-up was run with.
 */
import { render, screen } from '@testing-library/react'

import { MemberAvatar, avatarUserFor } from '@/components/standup/summary/MemberAvatar'

describe('avatarUserFor', () => {
  it('passes through the identity fields the summary join supplied', () => {
    expect(
      avatarUserFor({
        name: 'Kasun Perera',
        firstName: 'Kasun',
        lastName: 'Perera',
        email: 'kasun@example.test',
        avatar: 'https://cdn.example.test/kasun.png'
      })
    ).toEqual({
      firstName: 'Kasun',
      lastName: 'Perera',
      email: 'kasun@example.test',
      avatar: 'https://cdn.example.test/kasun.png'
    })
  })

  it('splits the stored name when the join found no user, so initials still read correctly', () => {
    expect(avatarUserFor({ name: 'Kasun Perera' })).toMatchObject({
      firstName: 'Kasun',
      lastName: 'Perera'
    })
  })

  it('uses the last word as the surname for a three-part name', () => {
    expect(avatarUserFor({ name: 'Anessa van Doe' })).toMatchObject({
      firstName: 'Anessa',
      lastName: 'Doe'
    })
  })

  it('tolerates a single-word name', () => {
    expect(avatarUserFor({ name: 'Kasun' })).toMatchObject({ firstName: 'Kasun', lastName: '' })
  })

  it('tolerates a name that was not stored as a string', () => {
    // The sections that render `Mixed` rows (variance, debt) hand this
    // component the row itself, so `name` is only unknown-typed at compile
    // time — a historical document could hold anything there.
    expect(avatarUserFor({ name: 1234 as unknown as string })).toMatchObject({
      firstName: '1234',
      lastName: ''
    })
  })

  it('tolerates a row with no name at all', () => {
    expect(avatarUserFor({})).toMatchObject({ firstName: '', lastName: '' })
  })
})

describe('MemberAvatar', () => {
  it('falls back to initials when the member has neither a photo nor an email', () => {
    render(<MemberAvatar member={{ name: 'Kasun Perera' }} size={28} />)

    expect(screen.getByText('KP')).toBeInTheDocument()
  })

  it('names the member for screen readers, since the image itself carries no meaning', () => {
    render(<MemberAvatar member={{ name: 'Kasun Perera', email: 'kasun@example.test' }} size={28} />)

    expect(screen.getByTestId('member-avatar')).toHaveAttribute('title', 'Kasun Perera')
  })

  it('requests an identicon default so an unregistered email still gets its own image', () => {
    render(<MemberAvatar member={{ name: 'Kasun Perera', email: 'kasun@example.test' }} size={28} />)

    expect(screen.getByTestId('member-avatar')).toHaveAttribute(
      'data-avatar-src',
      expect.stringContaining('d=identicon')
    )
  })

  it('prefers an uploaded photo over Gravatar', () => {
    render(
      <MemberAvatar
        member={{
          name: 'Kasun Perera',
          email: 'kasun@example.test',
          avatar: 'https://cdn.example.test/kasun.png'
        }}
        size={28}
      />
    )

    expect(screen.getByTestId('member-avatar')).toHaveAttribute(
      'data-avatar-src',
      'https://cdn.example.test/kasun.png'
    )
  })

  it('has no image source to offer when the member has neither', () => {
    render(<MemberAvatar member={{ name: 'Kasun Perera' }} size={28} />)

    expect(screen.getByTestId('member-avatar')).not.toHaveAttribute('data-avatar-src')
  })
})
