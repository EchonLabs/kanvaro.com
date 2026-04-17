export const TASK_TITLE_MAX_WORDS = 34

export function countWords(input: string): number {
  const matches = input.trim().match(/\S+/g)
  return matches ? matches.length : 0
}

/**
 * Truncates to at most `maxWords` words.
 * Preserves original spacing/punctuation up to the first extra word.
 */
export function truncateToMaxWords(input: string, maxWords: number): string {
  if (maxWords <= 0) return ''

  const wordRegex = /\S+/g
  let wordCount = 0
  let match: RegExpExecArray | null

  while ((match = wordRegex.exec(input)) !== null) {
    wordCount += 1
    if (wordCount > maxWords) {
      return input.slice(0, match.index).trimEnd()
    }
  }

  return input
}
