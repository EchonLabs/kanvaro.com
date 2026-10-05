/**
 * `Project.teamMembers` is an array of subdocuments - `[{ memberId, hourlyRate }]`
 * (see `src/models/Project.ts`). A long tail of route handlers treated it as a
 * flat array of ObjectIds and compared each element straight to a user id, e.g.
 *
 *     project.teamMembers.includes(user.id)
 *     project.teamMembers.some((m: any) => m?.toString?.() === userIdStr)
 *
 * Neither ever matches a subdocument, so the team-member branch of those access
 * checks was dead and only the creator or an explicit `projectRoles` entry could
 * get through.
 *
 * This is the one place that knows the shape. It accepts the subdocument form,
 * the populated form (`memberId` replaced by a user document) and - defensively,
 * for any legacy document that really does hold a bare id - the flat form.
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
