'use client'

import { MainLayout } from '@/components/layout/MainLayout'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Badge } from '@/components/ui/Badge'
import { 
  BarChart, 
  Download, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Clock,
  Target,
  Users,
  FileText
} from 'lucide-react'

export default function TestReportsPage() {
  const [cases, setCases] = useState<any[]>([])
  const [executions, setExecutions] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [casesRes, execsRes, projectsRes] = await Promise.all([
          fetch('/api/test-cases'),
          fetch('/api/test-executions?limit=500'),
          fetch('/api/projects')
        ])
        const [casesData, execsData, projectsData] = await Promise.all([
          casesRes.json().catch(() => ({})),
          execsRes.json().catch(() => ({})),
          projectsRes.json().catch(() => ({}))
        ])
        if (casesRes.ok && casesData?.success && Array.isArray(casesData.data)) setCases(casesData.data)
        else setCases([])
        if (execsRes.ok && execsData?.success && Array.isArray(execsData.data)) setExecutions(execsData.data)
        else setExecutions([])
        if (projectsRes.ok && projectsData?.success && Array.isArray(projectsData.data)) setProjects(projectsData.data)
        else setProjects([])
      } catch (e) {
        setCases([])
        setExecutions([])
        setProjects([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const summary = useMemo(() => {
    const totalTestCases = cases.length
    const passed = executions.filter(e => e.status === 'passed').length
    const failed = executions.filter(e => e.status === 'failed').length
    const blocked = executions.filter(e => e.status === 'blocked').length
    const actionable = passed + failed
    const passRate = actionable === 0 ? 0 : Math.round((passed / actionable) * 100)
    // Execution rate: unique executed test cases vs total test cases
    const uniqueExecutedCases = new Set(
      executions
        .map(e => (e?.testCase?._id || e?.testCase))
        .filter(Boolean)
        .map(String)
    ).size
    const executionRate = totalTestCases === 0 ? 0 : Math.round((uniqueExecutedCases / totalTestCases) * 100)
    return { totalTestCases, passed, failed, blocked, passRate, executionRate }
  }, [cases, executions])

  const projectStats = useMemo(() => {
    return projects.map(project => {
      const projectId = project._id || project.id
      
      // Get test cases for this project
      const projectCases = cases.filter(c => 
        (c.project?._id || c.project) === projectId
      )
      
      // Get test executions for this project
      const projectExecutions = executions.filter(e => 
        (e.project?._id || e.project) === projectId
      )
      
      // Calculate statistics
      const totalCases = projectCases.length
      const executed = projectExecutions.length
      const passed = projectExecutions.filter(e => e.status === 'passed').length
      const failed = projectExecutions.filter(e => e.status === 'failed').length
      const blocked = projectExecutions.filter(e => e.status === 'blocked').length
      
      // Calculate pass rate (only for executed tests)
      const actionable = passed + failed
      const passRate = actionable === 0 ? 0 : Math.round((passed / actionable) * 100)
      
      return {
        name: project.name,
        totalCases,
        executed,
        passed,
        failed,
        blocked,
        passRate
      }
    }).filter(project => project.totalCases > 0) // Only show projects with test cases
  }, [projects, cases, executions])

  const recentExecutions = useMemo(() => {
    return executions
      .slice(0, 10) // Get latest 10 executions
      .map(execution => ({
        testCase: execution.testCase?.title || 'Unknown Test Case',
        project: execution.project?.name || 'Unknown Project',
        status: execution.status,
        executedBy: execution.executedBy ? 
          `${execution.executedBy.firstName || ''} ${execution.executedBy.lastName || ''}`.trim() || 
          execution.executedBy.email || 'Unknown User' : 'Unknown User',
        executedAt: execution.executedAt || execution.createdAt
      }))
  }, [executions])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      case 'blocked': return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'blocked': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const buildCsv = (headers: string[], rows: (string | number | null | undefined)[][]) => {
    const escape = (val: any) => {
      if (val === null || val === undefined) return ''
      const s = String(val)
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    const lines = [headers.map(escape).join(',')]
    for (const row of rows) lines.push(row.map(escape).join(','))
    return lines.join('\n')
  }

  const handleExport = () => {
    const parts: string[] = []
    // Summary
    parts.push('# Summary')
    parts.push(buildCsv(
      ['metric', 'value'],
      [
        ['totalTestCases', summary.totalTestCases],
        ['executed_unique_cases', Math.round((summary.executionRate / 100) * summary.totalTestCases)],
        ['passed', summary.passed],
        ['failed', summary.failed],
        ['blocked', summary.blocked],
        ['passRate', `${summary.passRate}%`],
        ['executionRate', `${summary.executionRate}%`],
      ]
    ))
    parts.push('')
    // Project Stats
    parts.push('# Project Statistics')
    parts.push(buildCsv(
      ['name', 'totalCases', 'executed', 'passed', 'failed', 'blocked', 'passRate'],
      projectStats.map(p => [p.name, p.totalCases, p.executed, p.passed, p.failed, p.blocked, `${p.passRate}%`])
    ))
    parts.push('')
    // Recent Executions
    parts.push('# Recent Executions')
    parts.push(buildCsv(
      ['testCase', 'project', 'status', 'executedBy', 'executedAt'],
      recentExecutions.map(e => [e.testCase, e.project, e.status, e.executedBy, new Date(e.executedAt).toISOString()])
    ))

    const csv = parts.join('\n') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `test-reports-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Test Reports</h1>
            <p className="text-muted-foreground">
              Comprehensive test execution reports and analytics
            </p>
          </div>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Test Cases</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '—' : summary.totalTestCases}</div>
              <p className="text-xs text-muted-foreground">
                Across all projects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Execution Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '—' : `${summary.executionRate}%`}</div>
              <Progress value={summary.executionRate} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '—' : `${summary.passRate}%`}</div>
              <Progress value={summary.passRate} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Tests</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '—' : summary.failed}</div>
              <p className="text-xs text-muted-foreground">
                {loading ? '—' : `${summary.blocked} blocked`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Project Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Project Test Statistics</CardTitle>
            <CardDescription>
              Test execution statistics by project
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading project statistics...</div>
              </div>
            ) : projectStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Test Data Found</h3>
                <p className="text-muted-foreground max-w-md">
                  There are no projects with test cases available. Create test cases for your projects to see statistics here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {projectStats.map((project, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{project.name}</h4>
                      <Badge variant="outline">{project.passRate}% Pass Rate</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span>Total: {project.totalCases}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Executed: {project.executed}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>Passed: {project.passed}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span>Failed: {project.failed}</span>
                      </div>
                    </div>
                    <Progress value={project.passRate} className="mt-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Executions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Test Executions</CardTitle>
            <CardDescription>
              Latest test execution results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading recent executions...</div>
              </div>
            ) : recentExecutions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Test Executions Found</h3>
                <p className="text-muted-foreground max-w-md">
                  There are no test executions available. Execute some test cases to see recent activity here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentExecutions.map((execution, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(execution.status)}
                      <div>
                        <p className="font-medium">{execution.testCase}</p>
                        <p className="text-sm text-muted-foreground">
                          {execution.project} • {execution.executedBy}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(execution.status)}>
                        {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(execution.executedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
