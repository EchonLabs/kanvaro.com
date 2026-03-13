export function fixImagePathsInDescription(description: string): string {
  if (!description) return description

  let fixed = description

  // 1. Unescape HTML entities
  // Convert &lt; → <, &gt; → >, &quot; → ", &apos; → ', &amp; → &
  fixed = fixed.replace(/&lt;/g, '<')
  fixed = fixed.replace(/&gt;/g, '>')
  fixed = fixed.replace(/&quot;/g, '"')
  fixed = fixed.replace(/&#34;/g, '"')
  fixed = fixed.replace(/&apos;/g, "'")
  fixed = fixed.replace(/&#39;/g, "'")
  // Important: &amp; must be last to avoid double-unescaping
  fixed = fixed.replace(/&amp;/g, '&')

  // 2. Fix nested img tags (e.g., <img src="<img src="...">)
  // Pattern: <img src="<img...
  const nestedImgPattern = /<img\s+src="<img\s+src="([^"]+)"[^>]*>"/gi
  fixed = fixed.replace(nestedImgPattern, '<img src="$1" alt="task-image" />')

  // 3. Fix path issues and normalize
  // Convert "public/uploads/task/" → "/api/uploads/task/"
  fixed = fixed.replace(/["']public\/uploads\//gi, '"/api/uploads/')
  fixed = fixed.replace(/src=(['"]).*?\/public\/uploads\/task\/([^'"]*)\1/gi, 'src="$1/api/uploads/task/$2$1')

  // 4. Cleanup malformed img tags with broken attributes
  const brokenImgPattern = /<img\s+src="((?:([a-z]+)=""?\s*)*)/gi
  fixed = fixed.replace(brokenImgPattern, (match) => {
    const fileMatch = match.match(/[a-z0-9]+\.(png|jpg|jpeg|gif|webp|svg)/i)
    if (fileMatch) {
      // Reconstruct as proper img tag
      const filename = fileMatch[0]
      return `<img src="/api/uploads/task/${filename}" alt="task-image" />`
    }
    return match
  })

  // 5. Ensure all remaining img tags have proper alt attributes
  fixed = fixed.replace(/<img\s+src="([^"]+)"(\s+[^>]*)?\/?>/gi, (match, src) => {
    // Check if already has an alt attribute
    if (/\salt=/i.test(match)) {
      return match
    }
    // Add alt attribute if missing
    return `<img src="${src}" alt="task-image" />`
  })

  // 6. Normalize path format (remove duplicates like /api/uploads/task//api/uploads/task/)
  fixed = fixed.replace(/\/api\/uploads\/task\/+/g, '/api/uploads/task/')

  return fixed
}

/**
 * Detects if a description contains potentially broken img tags.
 * Useful for identifying tasks that need fixing.
 */
export function hasImagePathIssues(description: string): boolean {
  if (!description) return false

  // Check for indicators of broken img tags
  const hasEscapedTags = /&lt;img|&gt;/i.test(description)
  const hasNestedTags = /<img\s+src="<img/i.test(description)
  const hasBrokenAttributes = /src="(api=""|[a-z]+="")/i.test(description)

  return hasEscapedTags || hasNestedTags || hasBrokenAttributes
}

/**
 * Batch fixes descriptions in an array of task objects.
 * Mutates the objects in place.
 */
export function fixTaskDescriptions(tasks: Array<{ description?: string }>): void {
  for (const task of tasks) {
    if (task.description) {
      task.description = fixImagePathsInDescription(task.description)
    }
  }
}
