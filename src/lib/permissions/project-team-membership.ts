/**
 * Is this user on the project's team?
 *
 * `Project.teamMembers` is an array of subdocuments - `[{ memberId, hourlyRate }]`
 * (see `src/models/Project.ts`). Comparing an element of it straight to a user
 * id never matches, which is how every team member came to fall through to
 * PROJECT_VIEWER in `permission-service.ts`.
 *
 * This is the one place that knows the shape, so callers keep working if a
 * query ever starts populating `teamMembers.memberId`. It accepts the
 * subdocument form, the populated form (`memberId` replaced by a user
 * document) and - defensively, for any legacy document that really does hold a
 * bare or populated id - the flat form.
 *
 * Note: a long tail of route handlers outside the permission system still
 * compare `teamMembers` elements directly, e.g.
 *
 *     project.teamMembers.includes(authResult.user.id)
 *     project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
 *
 * Those branches are dead. Routing them through this helper would revive them,
 * which is a widening decision of its own - deliberately not taken here, since
 * each sits beside a narrower role gate that currently runs.
 */
export function isProjectTeamMember(
  project: { teamMembers?: unknown } | null | undefined,
  userId: unknown
): boolean {
  const members = project?.teamMembers;

  if (!Array.isArray(members) || userId === null || userId === undefined) {
    return false;
  }

  const wanted = typeof userId === 'string' ? userId : String(userId);

  if (!wanted) {
    return false;
  }

  return members.some(entry => {
    if (entry === null || entry === undefined) {
      return false;
    }

    const member = entry as { memberId?: unknown; _id?: unknown };
    // A subdocument carries `memberId`; once populated that is a user document.
    // Failing that the element is treated as the id itself, or - for a legacy
    // flat array that has been populated into user documents - as that
    // document. `_id` can only be a subdocument's own id when `memberId` is
    // absent, which never coincides with a user id.
    const raw =
      member.memberId !== null && member.memberId !== undefined
        ? (member.memberId as { _id?: unknown })?._id ?? member.memberId
        : member._id ?? entry;

    if (raw === null || raw === undefined) {
      return false;
    }

    // Guard against the exact failure mode this helper replaces: stringifying a
    // subdocument yields something like "[object Object]", never an id.
    const candidate = String(raw);
    return candidate.length > 0 && candidate === wanted;
  });
}
