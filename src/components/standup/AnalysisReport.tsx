'use client'

import { RiskScoreGauge } from './RiskScoreGauge'
import { NudgeList } from './NudgeList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Lightbulb, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatDistanceToNow } from 'date-fns'

interface Analysis {
  riskScore: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  summary: string
  nudges: { userId: string; taskId: string; message: string }[]
  trends: string[]
  prioritySuggestions: string[]
  generatedAt: string
}

interface Member {
  _id: string
  firstName: string
  lastName: string
}

interface AnalysisReportProps {
  analysis: Analysis | null
  members: Member[]
  onRequestAnalysis: () => void
  analyzing: boolean
}

export function AnalysisReport({
  analysis,
  members,
  onRequestAnalysis,
  analyzing,
}: AnalysisReportProps) {
  if (!analysis && !analyzing) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Zap className="h-8 w-8 text-muted-foreground opacity-40" />
          <div>
            <p className="font-medium text-sm">No analysis yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analysis runs automatically before 8 AM, or you can trigger it now.
            </p>
          </div>
          <Button size="sm" onClick={onRequestAnalysis}>
            Generate Analysis
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (analyzing) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Analyzing with Groq…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Risk score + summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 items-start">
            <RiskScoreGauge score={analysis!.riskScore} level={analysis!.riskLevel} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1">Sprint Health Summary</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis!.summary}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Generated {formatDistanceToNow(new Date(analysis!.generatedAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nudges */}
      {analysis!.nudges.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide px-0.5">
            Follow-up Nudges
          </p>
          <NudgeList nudges={analysis!.nudges} members={members} />
        </div>
      )}

      {/* Priority suggestions */}
      {analysis!.prioritySuggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Priority Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {analysis!.prioritySuggestions.map((s, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                <span>{s}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
        onClick={onRequestAnalysis}
        disabled={analyzing}
      >
        Regenerate Analysis
      </Button>
    </div>
  )
}
