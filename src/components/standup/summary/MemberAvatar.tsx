import { getAvatarData } from '@/lib/gravatar'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { cn } from '@/lib/utils'

import type { MemberIdentity } from './types'

/**
 * One member's face, anywhere the summary names a person.
 *
 * Wraps the app-wide `GravatarAvatar` rather than drawing another coloured
 * initials circle: a member should look the same here as they do in the
 * header, on the team page and on a task. What this adds is the summary's own
 * problem — its rows are historical records that carry a `name` and, only
 * after `getSummary`'s join, an identity. So the name is the floor: a member
 * whose user record has since been deleted still gets readable initials.
 */

/** Gravatar's own default for a member who never registered an address. */
const GRAVATAR_OPTIONS = { default: 'identicon' } as const

export interface AvatarMember extends MemberIdentity {
  name?: string
}

/**
 * The `{ firstName, lastName, email, avatar }` shape `getAvatarData` expects,
 * filled from whichever of the two sources has it.
 *
 * Splitting the stored `name` is a fallback, not the main path — the join
 * supplies the real fields whenever the member still exists. It takes the
 * first word and the last, matching `getUserInitials`' own first/last rule,
 * so "Anessa van Doe" initials as AD rather than AV.
 */
export function avatarUserFor(member: AvatarMember) {
  // Coerced, not trusted: the variance and debt sections pass their `Mixed`
  // row straight through, so `name` is only a string by convention.
  const parts = String(member.name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return {
    firstName: member.firstName ?? parts[0] ?? '',
    lastName: member.lastName ?? (parts.length > 1 ? parts[parts.length - 1]! : ''),
    email: member.email,
    avatar: member.avatar
  }
}

export function MemberAvatar({
  member,
  size = 28,
  className
}: {
  member: AvatarMember
  size?: number
  className?: string
}) {
  const user = avatarUserFor(member)
  const { avatarUrl } = getAvatarData(user, { size, ...GRAVATAR_OPTIONS })

  return (
    <span
      data-testid="member-avatar"
      /**
       * The resolved source, exposed on the wrapper because the `<img>` Radix
       * renders only exists once the browser has actually loaded it — there
       * is nothing to assert against, or to debug from, until then.
       */
      data-avatar-src={avatarUrl || undefined}
      title={member.name ? String(member.name) : undefined}
      className={cn('inline-flex shrink-0', className)}
    >
      <GravatarAvatar
        user={user}
        size={size}
        gravatarOptions={GRAVATAR_OPTIONS}
        className="border border-[var(--sur-border)]"
      />
    </span>
  )
}
