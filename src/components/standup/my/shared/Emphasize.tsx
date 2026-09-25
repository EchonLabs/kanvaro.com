export interface EmphasizeProps {
  /** A complete, translatable sentence from `standupStrings`. */
  text: string
  /** The phrase inside `text` to highlight. Rendered plain if it cannot be found — never dropped. */
  phrase: string
  className?: string
}

/**
 * Highlights one phrase inside a whole sentence, so copy stays a single
 * string in the catalogue rather than being stitched together from fragments.
 */
export function Emphasize({ text, phrase, className }: EmphasizeProps) {
  const index = phrase ? text.indexOf(phrase) : -1
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <strong className={className}>{phrase}</strong>
      {text.slice(index + phrase.length)}
    </>
  )
}
