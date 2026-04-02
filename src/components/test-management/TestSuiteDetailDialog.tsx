'use client'

import { useState, useEffect } from 'react'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
    Folder,
    FolderOpen,
    FileText,
    Calendar,
    User,
    Tag,
    Edit,
    Trash2,
    Plus,
    Loader2,
    ChevronRight,
    Clock,
    Info
} from 'lucide-react'

interface TestSuiteDetailDialogProps {
    suiteId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onEdit?: (suite: any) => void
    onDelete?: (suiteId: string) => void
    onCreateChild?: (parentSuiteId: string) => void
    onCreateTestCase?: (suiteId: string) => void
    onChildSuiteClick?: (suiteId: string) => void
    refreshKey?: number
}

export function TestSuiteDetailDialog({
    suiteId,
    open,
    onOpenChange,
    onEdit,
    onDelete,
    onCreateChild,
    onCreateTestCase,
    onChildSuiteClick,
    refreshKey
}: TestSuiteDetailDialogProps) {
    const [suite, setSuite] = useState<any | null>(null)
    const [childSuites, setChildSuites] = useState<any[]>([])
    const [testCases, setTestCases] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [childrenLoading, setChildrenLoading] = useState(false)
    const [casesLoading, setCasesLoading] = useState(false)

    useEffect(() => {
        if (open && suiteId) {
            fetchSuiteDetails(suiteId)
            fetchChildSuites(suiteId)
            fetchTestCases(suiteId)
        } else if (!open) {
            setSuite(null)
            setChildSuites([])
            setTestCases([])
        }
    }, [open, suiteId, refreshKey])

    const fetchSuiteDetails = async (id: string) => {
        try {
            setLoading(true)
            const res = await fetch(`/api/test-suites/${id}`)
            const data = await res.json()
            if (res.ok && data?.success) {
                setSuite(data.data)
            } else {
                setSuite(null)
            }
        } catch {
            setSuite(null)
        } finally {
            setLoading(false)
        }
    }

    const fetchChildSuites = async (id: string) => {
        try {
            setChildrenLoading(true)
            const res = await fetch(`/api/test-suites/${id}/children`)
            const data = await res.json()
            if (res.ok && data?.success && Array.isArray(data.data)) {
                setChildSuites(data.data)
            } else {
                setChildSuites([])
            }
        } catch {
            setChildSuites([])
        } finally {
            setChildrenLoading(false)
        }
    }

    const fetchTestCases = async (id: string) => {
        try {
            setCasesLoading(true)
            const res = await fetch(`/api/test-cases?testSuiteId=${id}`)
            const data = await res.json()
            if (res.ok && data?.success && Array.isArray(data.data)) {
                setTestCases(data.data)
            } else {
                setTestCases([])
            }
        } catch {
            setTestCases([])
        } finally {
            setCasesLoading(false)
        }
    }

    const formatDate = (dateString?: string) => {
        if (!dateString) return '—'
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
            case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
        }
    }

    return (
        <ResponsiveDialog
            open={open}
            onOpenChange={onOpenChange}
            title={suite?.name ? `${suite.name}` : 'Test Suite Details'}
            className="max-w-lg sm:max-w-2xl lg:max-w-4xl"
        >
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : !suite ? (
                <div className="text-center py-12 text-muted-foreground">
                    <Folder className="h-10 w-10 mx-auto mb-3" />
                    <p>Unable to load suite details</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Description */}
                    {suite.description && (
                        <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-4 sm:p-5">
                            <div className="absolute top-3 left-4">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/60">Description</span>
                                </div>
                            </div>
                            <p className="text-sm leading-relaxed text-foreground/80 mt-5 whitespace-pre-wrap break-words">{suite.description}</p>
                        </div>
                    )}

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                            <Folder className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                                <div className="text-xs text-muted-foreground font-medium">Project</div>
                                <div className="text-sm font-medium truncate">{suite.project?.name || '—'}</div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                            <FolderOpen className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                                <div className="text-xs text-muted-foreground font-medium">Parent Suite</div>
                                <div className="text-sm font-medium truncate">{suite.parentSuite?.name || 'Root (No Parent)'}</div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                            <User className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                                <div className="text-xs text-muted-foreground font-medium">Created By</div>
                                <div className="text-sm font-medium truncate">
                                    {suite.createdBy
                                        ? `${suite.createdBy.firstName || ''} ${suite.createdBy.lastName || ''}`.trim() || suite.createdBy.email
                                        : '—'}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                            <Calendar className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                                <div className="text-xs text-muted-foreground font-medium">Created At</div>
                                <div className="text-sm font-medium">{formatDate(suite.createdAt)}</div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                            <Clock className="h-4 w-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                                <div className="text-xs text-muted-foreground font-medium">Last Updated</div>
                                <div className="text-sm font-medium">{formatDate(suite.updatedAt)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ResponsiveDialog>
    )
}
