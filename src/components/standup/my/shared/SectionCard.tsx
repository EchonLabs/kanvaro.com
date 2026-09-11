import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export interface SectionCardProps {
  title: string
  summary?: React.ReactNode
  children: React.ReactNode
}

/**
 * Rule R1 (design §3): every section header carries a live number, not a
 * noun. Structural, not just a convention — a section physically cannot be
 * added to this screen without passing something into `summary`.
 */
export function SectionCard({ title, summary, children }: SectionCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle>{title}</CardTitle>
        {summary ? (
          <span className="text-[13px] text-[var(--apple-secondary-label)]">{summary}</span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  )
}
