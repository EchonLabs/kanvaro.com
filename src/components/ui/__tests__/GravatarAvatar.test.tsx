/**
 * @jest-environment jsdom
 */
/**
 * Which image an avatar points at.
 *
 * Radix renders the `<img>` only once the browser has loaded it, which jsdom
 * never does, so these tests assert on the URL the component computes rather
 * than on a rendered image. `getAvatarData` is the pure function that
 * resolves it; the component tests pin that `GravatarAvatar` actually asks it
 * with the caller's options, so the summary's `identicon` default reaches it.
 */
import { createHash } from 'crypto'
import { render } from '@testing-library/react'

import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import * as gravatar from '@/lib/gravatar'

jest.mock('@/lib/gravatar', () => {
  const actual = jest.requireActual('@/lib/gravatar')
  return { ...actual, getAvatarData: jest.fn(actual.getAvatarData) }
})

const getAvatarDataSpy = gravatar.getAvatarData as jest.Mock
const actualGetAvatarData = jest.requireActual('@/lib/gravatar').getAvatarData as typeof gravatar.getAvatarData

const md5 = (value: string) => createHash('md5').update(value).digest('hex')

describe('avatar URL resolution', () => {
  it('prefers an uploaded photo over Gravatar', () => {
    const { avatarUrl } = actualGetAvatarData(
      { email: 'kasun@example.test', avatar: 'https://cdn.example.test/kasun.png' },
      { size: 28, default: 'identicon' }
    )

    expect(avatarUrl).toBe('https://cdn.example.test/kasun.png')
  })

  it('uses a Gravatar URL derived from the email, with the identicon default, when there is no photo', () => {
    const { avatarUrl } = actualGetAvatarData(
      { email: ' Kasun@Example.test ' },
      { size: 28, default: 'identicon' }
    )

    const url = new URL(avatarUrl)
    expect(url.origin + url.pathname).toBe(
      'https://www.gravatar.com/avatar/' + md5('kasun@example.test')
    )
    expect(url.searchParams.get('d')).toBe('identicon')
    expect(url.searchParams.get('s')).toBe('28')
  })

  it('produces no image URL, only initials, when there is neither a photo nor an email', () => {
    expect(actualGetAvatarData({ firstName: 'Kasun', lastName: 'Perera' }, { default: 'identicon' })).toEqual({
      avatarUrl: '',
      fallbackInitials: 'KP'
    })
    expect(actualGetAvatarData(undefined, { default: 'identicon' }).avatarUrl).toBe('')
  })
})

describe('GravatarAvatar', () => {
  beforeEach(() => getAvatarDataSpy.mockClear())

  it('resolves its image with the size and Gravatar options the caller passed', () => {
    render(
      <GravatarAvatar
        user={{ firstName: 'Kasun', lastName: 'Perera', email: 'kasun@example.test' }}
        size={28}
        gravatarOptions={{ default: 'identicon' }}
      />
    )

    expect(getAvatarDataSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'kasun@example.test' }),
      { size: 28, default: 'identicon' }
    )
  })

  it('falls back to initials without an image URL when the user has no photo or email', () => {
    const { container, getByText } = render(
      <GravatarAvatar user={{ firstName: 'Kasun', lastName: 'Perera' }} size={28} />
    )

    expect(getByText('KP')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(getAvatarDataSpy.mock.results[0]!.value.avatarUrl).toBe('')
  })
})
