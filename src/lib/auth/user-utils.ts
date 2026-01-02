// Small helper to normalize user id from varied API shapes.
export function extractUserId(payload: any): string | undefined {
  if (!payload) return undefined
  const userObj = payload.user ?? payload
  const id = userObj?._id ?? userObj?.id ?? userObj?.userId
  return id ? id.toString() : undefined
}
