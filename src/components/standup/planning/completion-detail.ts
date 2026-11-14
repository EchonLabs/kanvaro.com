/**
 * The secondary line on the "Planning complete" card, from the completion
 * response's `generatedStandups` (`null` when the project has stand-ups off).
 *
 * Returns null when there is nothing to add: with stand-ups off the main
 * message already says none were scheduled, and a re-run that created nothing
 * new has no count worth announcing.
 */
export function completionDetail(
  generated: { created: number; totalSprintDays: number } | null | undefined
): string | null {
  if (!generated || generated.created === 0) return null
  const noun = generated.created === 1 ? 'stand-up' : 'stand-ups'
  return `${generated.created} ${noun} scheduled, one for each working day.`
}
