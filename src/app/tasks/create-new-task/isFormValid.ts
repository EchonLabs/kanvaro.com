// Extracted from page.tsx so the required-field rule can be unit tested
// without rendering the whole page, and so it doesn't add a disallowed
// named export to a Next.js `page.tsx` file (App Router only permits a
// fixed set of exports there).
//
// Assignee is intentionally excluded: ownership is decided during sprint
// planning, not at creation time (mirrors CreateTaskModal.tsx, which treats
// assignedTo as optional).
export function computeIsFormValid(params: {
  title: string
  project: string
  dueDate: string
  subtasks: { title: string }[]
}): boolean {
  return (
    !!params.title.trim() &&
    !!params.project &&
    !!params.dueDate &&
    !params.subtasks.some(st => !(st.title && st.title.trim().length > 0))
  )
}
