/**
 * Post-collection filtering for `/api/search`.
 *
 * The route gathers results from six entity types with six different queries,
 * so the filters are applied once to the assembled list rather than pushed into
 * each query. Kept pure and separate because that is the part worth testing:
 * these filters were sent by the client and silently ignored by the server for
 * as long as the search panel has existed.
 */

/** One search result, narrowed to the fields a filter can look at. */
export interface FilterableResult {
  type: string
  metadata: {
    status?: string
    priority?: string
    assignee?: string
    project?: string
  }
}

export interface SearchFilterSet {
  type?: string[]
  status?: string[]
  priority?: string[]
  assignee?: string[]
  project?: string[]
}

/** The client joins each multi-select with commas; this is the other half. */
export function parseFilterList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

/**
 * Values within one filter are OR; separate filters are AND — what a faceted
 * panel means by ticking two types and one status.
 *
 * A result missing the field a filter names is dropped, never kept: passing it
 * through is what "the filter does nothing" looked like in the first place.
 */
export function applySearchFilters<T extends FilterableResult>(
  results: T[],
  filters: SearchFilterSet
): T[] {
  const matches = (value: string | undefined, wanted?: string[]) => {
    if (!wanted?.length) return true
    if (!value) return false
    // `assignee` can hold several names joined with commas, so a filter matches
    // when the named person is one of them.
    const parts = value.split(',').map((part) => part.trim().toLowerCase())
    return wanted.some((want) => parts.includes(want.trim().toLowerCase()))
  }

  return results.filter(
    (result) =>
      matches(result.type, filters.type) &&
      matches(result.metadata.status, filters.status) &&
      matches(result.metadata.priority, filters.priority) &&
      matches(result.metadata.assignee, filters.assignee) &&
      matches(result.metadata.project, filters.project)
  )
}
