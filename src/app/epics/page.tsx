"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatToTitleCase } from "@/lib/utils";
import { Progress } from "@/components/ui/Progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/permissions/permission-context";
import { Permission } from "@/lib/permissions/permission-definitions";
import { PermissionGate } from "@/lib/permissions/permission-components";
import { useNotify } from "@/lib/notify";
import { useDateTime } from "@/components/providers/DateTimeProvider";
import { extractUserId } from "@/lib/auth/user-utils";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  Clock,
  CheckCircle,
  Pause,
  XCircle,
  Play,
  Loader2,
  User,
  Target,
  Zap,
  BarChart3,
  List,
  Kanban,
  Users,
  TrendingUp,
  Calendar as CalendarIcon,
  Star,
  Layers,
  Eye,
  Edit,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StatusBadge,
  PriorityBadge,
  GradientProgress,
  PageHeader,
  TasksEmptyState,
  CardGridSkeleton,
  PaginationBar,
  MetaChip,
  FullPageLoader,
  ViewSwitcher,
  cardShell,
  cardHover,
  TASK_STATUS_CONFIG,
} from "@/components/tasks/TasksShared";

// Added Project interface for type safety
interface Project {
  _id: string;
  name: string;
}
interface Epic {
  _id: string;
  title: string;
  description: string;
  status:
    | "backlog"
    | "todo"
    | "in_progress"
    | "review"
    | "testing"
    | "done"
    | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  project: {
    _id: string;
    name: string;
  };
  assignedTo?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  createdBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
  storyPoints?: number;
  dueDate?: string;
  estimatedHours?: number;
  tags: string[];
  progress: {
    completionPercentage: number;
    storiesCompleted: number;
    totalStories: number;
    storyPointsCompleted: number;
    totalStoryPoints: number;
  };
  createdAt: string;
  updatedAt: string;
}

export default function EpicsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext();

  const router = useRouter();
  const searchParams = useSearchParams();
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  // Added project filter state
  const [projectFilter, setProjectFilter] = useState("all");
  const [projectFilterQuery, setProjectFilterQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const filtersInitializedRef = useRef(false);
  const projectFilterInputRef = useRef<HTMLInputElement | null>(null);
  const hasFetchedProjects = useRef(false);

  const { hasPermission } = usePermissions();
  const { success: notifySuccess, error: notifyError } = useNotify();
  const { formatDate } = useDateTime();

  // NEW: Helper function to focus filter search inputs (from kanban page)
  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return;

    const doFocus = () => {
      el.focus({ preventScroll: true });
      try {
        el.select?.();
      } catch {
        // ignore
      }
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(doFocus);
    } else {
      setTimeout(doFocus, 0);
    }
  };

  // Added fetchProjects function
  const fetchProjects = useCallback(async (force = false) => {
    if (hasFetchedProjects.current && !force) {
      return;
    }

    let fetchSucceeded = false;
    hasFetchedProjects.current = true;

    try {
      const response = await fetch("/api/projects");
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data);
      } else {
        setProjects([]);
      }
      fetchSucceeded = true;
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      setProjects([]);
    } finally {
      if (!fetchSucceeded) {
        hasFetchedProjects.current = false;
      }
    }
  }, []);

  // Auth initialization - trigger data loading
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLoading(false);
      fetchEpics();
      fetchProjects();
    } else if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, fetchProjects]);

  // Show success when redirected with ?updated=true
  useEffect(() => {
    const updated = searchParams.get("updated");
    if (updated === "true") {
      notifySuccess({ title: "Epic updated successfully" });
      router.replace("/epics", { scroll: false });
    }
    // notifySuccess is stable enough; omit from deps to avoid re-run loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  // Fetch when pagination changes (after initial load)
  useEffect(() => {
    if (!loading) {
      fetchEpics();
    }
  }, [currentPage, pageSize]);

  // Fetch when filters change
  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }
    if (currentPage === 1) {
      fetchEpics();
    } else {
      setCurrentPage(1);
    }
  }, [statusFilter, priorityFilter, projectFilter]);

  const fetchEpics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", currentPage.toString());
      params.set("limit", pageSize.toString());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (projectFilter !== "all") params.set("project", projectFilter);

      const response = await fetch(`/api/epics?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        const epicData = Array.isArray(data.data) ? data.data : [];
        setEpics(epicData);
        setTotalCount(data.pagination?.total ?? epicData.length);
      } else {
        console.error("Failed to fetch epics:", data);
        notifyError({
          title: "Failed to Load Epics",
          message: data.error || "Failed to fetch epics",
        });
      }
    } catch (err) {
      console.error("Fetch epics error:", err);
      notifyError({
        title: "Failed to Load Epics",
        message: "Failed to fetch epics",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (epic: Epic) => {
    setSelectedEpic(epic);
    setShowDeleteConfirmModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedEpic) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/epics/${selectedEpic._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEpics((prev) => prev.filter((e) => e._id !== selectedEpic._id));
        setShowDeleteConfirmModal(false);
        setSelectedEpic(null);
        notifySuccess({ title: "Epic deleted successfully" });
      } else {
        notifyError({
          title: "Failed to Delete Epic",
          message: data.error || "Failed to delete epic",
        });
        setShowDeleteConfirmModal(false);
      }
    } catch (e) {
      notifyError({
        title: "Failed to Delete Epic",
        message: "Failed to delete epic",
      });
      setShowDeleteConfirmModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "backlog":
        return "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900";
      case "todo":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900";
      case "inprogress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900";
      case "done":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "backlog":
        return <Layers className="h-4 w-4" />;
      case "todo":
        return <Target className="h-4 w-4" />;
      case "inprogress":
        return <Play className="h-4 w-4" />;
      case "done":
        return <CheckCircle className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900";
      case "medium":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900";
      case "critical":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900";
    }
  };

  // Added filtered project options based on projectFilterQuery
  const filteredProjectOptions = useMemo(() => {
    const query = projectFilterQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      project.name.toLowerCase().includes(query),
    );
  }, [projects, projectFilterQuery]);

  const locallyFilteredEpics = useMemo(() => {
    if (!localSearch.trim()) return epics;
    const q = localSearch.trim().toLowerCase();
    return epics.filter((epic) => {
      // Match title, description, project name, tags, or assigned user details
      if (epic.title?.toLowerCase().includes(q)) return true;
      if (epic.description?.toLowerCase().includes(q)) return true;
      if (epic.project?.name?.toLowerCase().includes(q)) return true;
      if (epic.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;
      if (epic.assignedTo?.firstName?.toLowerCase().includes(q)) return true;
      if (epic.assignedTo?.lastName?.toLowerCase().includes(q)) return true;
      if (epic.assignedTo?.email?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [localSearch, epics]);

  const displayedEpics = locallyFilteredEpics;
  const totalEpicsCount = totalCount ?? displayedEpics.length;
  const totalPages = Math.max(
    1,
    Math.ceil((totalEpicsCount || 0) / pageSize) || 1,
  );
  const pageStartIndex =
    totalEpicsCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEndIndex =
    totalEpicsCount === 0
      ? 0
      : Math.min(currentPage * pageSize, totalEpicsCount);

  const isCreator = (epic: Epic) => {
    const creatorId =
      (epic as any)?.createdBy?._id || (epic as any)?.createdBy?.id;
    const currentUserId = user ? (user as any)._id || (user as any).id : null;
    return (
      creatorId &&
      currentUserId &&
      creatorId.toString() === currentUserId.toString()
    );
  };

  const canViewEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_VIEW) ||
    hasPermission(Permission.EPIC_READ) ||
    isCreator(epic);

  const canEditEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_EDIT) || isCreator(epic);

  const canDeleteEpic = (epic: Epic) =>
    hasPermission(Permission.EPIC_DELETE) || isCreator(epic);

  const canCreateEpic = hasPermission(Permission.EPIC_CREATE);

  if (loading) {
    return (
      <MainLayout>
        <FullPageLoader label="Loading epics..." />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

        {/* Page Header */}
        <PageHeader
          title="Epics"
          subtitle="Manage your product epics and large features"
          actions={
            <PermissionGate permission={Permission.EPIC_CREATE}>
              <Button
                onClick={() => {
                  if (!canCreateEpic) return;
                  router.push("/epics/create-epic");
                }}
                disabled={!canCreateEpic}
                title={
                  !canCreateEpic
                    ? "You need epic:create permission to create an epic."
                    : undefined
                }
                className="h-9 px-5 rounded-full bg-[var(--apple-system-blue)] text-white hover:opacity-90 apple-transition text-[14px] font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Epic
              </Button>
            </PermissionGate>
          }
        />

        {/* ── Filter Toolbar ───────────────────────────────────────────────── */}

        {/* Row 1: Search (50%) + Status (25%) + Priority (25%) — Desktop */}
        <div className="hidden sm:flex items-center gap-2">
            <div className="relative w-1/2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" />
                <input
                    placeholder="Search epics..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="w-full pl-10 pr-9 h-10 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[15px] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition text-[var(--apple-label)]"
                />
                {localSearch && (
                    <button
                        type="button"
                        onClick={() => setLocalSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] apple-transition"
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-1/4 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="inprogress">In Progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-1/4 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                    <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
            </Select>
        </div>

        {/* Row 1: Mobile layout (stack) */}
        <div className="flex sm:hidden flex-col gap-2">
            <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" />
                <input
                    placeholder="Search epics..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="w-full pl-10 pr-9 h-10 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[15px] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition text-[var(--apple-label)]"
                />
                {localSearch && (
                    <button
                        type="button"
                        onClick={() => setLocalSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] apple-transition"
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
            <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-1/2 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="backlog">Backlog</SelectItem>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="inprogress">In Progress</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-1/2 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                        <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Priority</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>

        {/* Row 2: Secondary Filters (Grid 20% each on Desktop, 2 cols on mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
            <Select
              value={projectFilter}
              onValueChange={setProjectFilter}
              onOpenChange={(open) => {
                if (open) focusSearchInput(projectFilterInputRef.current);
              }}
            >
              <SelectTrigger className="h-9 rounded-full border-[var(--apple-separator)] bg-background text-[13px]">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="z-[10050] p-0">
                <div className="p-2">
                  <div className="relative mb-2">
                    <Input
                      ref={projectFilterInputRef}
                      value={projectFilterQuery}
                      onChange={(e) => setProjectFilterQuery(e.target.value)}
                      placeholder="Search projects"
                      className="pr-10 text-[13px]"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    {projectFilterQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setProjectFilterQuery("");
                          setProjectFilter("all");
                        }}
                        className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
                        aria-label="Clear project filter"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <SelectItem value="all">All Projects</SelectItem>
                    {filteredProjectOptions.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-[var(--apple-tertiary-label)]">
                        No matching projects
                      </div>
                    ) : (
                      filteredProjectOptions.map((project) => (
                        <SelectItem key={project._id} value={project._id}>
                          {project.name}
                        </SelectItem>
                      ))
                    )}
                  </div>
                </div>
              </SelectContent>
            </Select>
        </div>

        {/* Row 3: Active Filters & Clear */}
        {(statusFilter !== 'all' || priorityFilter !== 'all' || projectFilter !== 'all' || localSearch) && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--apple-separator)]">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--apple-secondary-label)] uppercase tracking-wider mr-1">
                        Active Filters:
                    </span>
                    {localSearch && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Search: {localSearch}
                            <button onClick={() => setLocalSearch('')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" /></button>
                        </Badge>
                    )}
                    {statusFilter !== 'all' && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Status: {formatToTitleCase(statusFilter)}
                            <button onClick={() => setStatusFilter('all')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" /></button>
                        </Badge>
                    )}
                    {priorityFilter !== 'all' && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Priority: {formatToTitleCase(priorityFilter)}
                            <button onClick={() => setPriorityFilter('all')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" /></button>
                        </Badge>
                    )}
                    {projectFilter !== 'all' && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Project: {projects.find(p => p._id === projectFilter)?.name || 'Selected'}
                            <button onClick={() => setProjectFilter('all')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" /></button>
                        </Badge>
                    )}
                </div>
                <Button
                    variant="ghost"
                    onClick={() => {
                        setLocalSearch('');
                        setStatusFilter('all');
                        setPriorityFilter('all');
                        setProjectFilter('all');
                    }}
                    className="h-8 px-3 text-[13px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] rounded-full"
                >
                    Clear All
                </Button>
            </div>
        )}

        {/* Count + View Switcher */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            <span className="font-apple-mono font-medium text-[var(--apple-label)]">
              {localSearch ? displayedEpics.length : totalEpicsCount}
            </span>
            {localSearch && (
              <span className="text-[var(--apple-tertiary-label)]">
                {" "}of {totalEpicsCount}
              </span>
            )}{" "}
            epic{(localSearch ? displayedEpics.length : totalEpicsCount) !== 1 ? "s" : ""}
          </p>
          <ViewSwitcher
            value={viewMode}
            onChange={(v) => setViewMode(v as "grid" | "list")}
            options={["grid", "list"]}
          />
        </div>

        {/* Epics Content */}
        {displayedEpics.length === 0 ? (
          <TasksEmptyState
            icon={<Layers className="h-10 w-10" />}
            title="No epics found"
            description="Create your first epic to track large-scale features."
          />
        ) : viewMode === "grid" ? (
          /* ── Grid View ── */
          <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {displayedEpics.map((epic) => {
              const viewAllowed = canViewEpic(epic);
              const editAllowed = canEditEpic(epic);
              const deleteAllowed = canDeleteEpic(epic);

              const gradients = [
                { g: "from-purple-500 to-violet-600", glow: "rgba(139,92,246,0.2)" },
                { g: "from-blue-500 to-cyan-500",     glow: "rgba(59,130,246,0.2)" },
                { g: "from-emerald-500 to-teal-500",  glow: "rgba(16,185,129,0.2)" },
                { g: "from-orange-500 to-amber-500",  glow: "rgba(249,115,22,0.2)" },
                { g: "from-rose-500 to-pink-500",     glow: "rgba(244,63,94,0.2)"  },
                { g: "from-sky-500 to-indigo-500",    glow: "rgba(14,165,233,0.2)" },
              ];
              const gradient = gradients[displayedEpics.indexOf(epic) % gradients.length];
              const pct = epic.progress?.completionPercentage ?? 0;

              return (
                <div
                  key={epic._id}
                  className={cn(
                    "card-fade-in group rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card overflow-hidden",
                    "shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none",
                    "hover:shadow-[0_10px_40px_rgba(0,0,0,0.13)] dark:hover:shadow-[0_10px_40px_rgba(0,0,0,0.42)]",
                    "hover:-translate-y-1 apple-transition",
                    viewAllowed ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
                  )}
                  onClick={() => viewAllowed && router.push(`/epics/${epic._id}`)}
                >
                  {/* Gradient header bar */}
                  <div className="h-1.5 w-full" style={{ background: 'var(--apple-card-gradient)' }} />

                  <div className="p-5 space-y-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="h-8 w-8 rounded-[var(--apple-radius-sm)] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 2px 8px var(--apple-chart-glow)' }}>
                            <Layers className="h-4 w-4 text-white" />
                          </div>
                          <h3
                            className="text-[16px] font-semibold text-[var(--apple-label)] truncate"
                            title={epic.title}
                          >
                            {epic.title}
                          </h3>
                        </div>
                        {epic.description && (
                          <p className="text-[13px] text-[var(--apple-secondary-label)] line-clamp-2 pl-10">
                            {epic.description}
                          </p>
                        )}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)] sm:opacity-0 sm:group-hover:opacity-100 apple-transition flex-shrink-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!viewAllowed}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!viewAllowed) return;
                              router.push(`/epics/${epic._id}`);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Epic
                          </DropdownMenuItem>
                          {editAllowed && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/epics/${epic._id}/edit`);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Epic
                            </DropdownMenuItem>
                          )}
                          {deleteAllowed && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(epic);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Epic
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge status={epic.status} size="sm" />
                      <PriorityBadge priority={epic.priority} size="sm" />
                    </div>

                    {/* Progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--apple-tertiary-label)] apple-section-label">
                          Progress
                        </span>
                        <span className="text-[12px] font-apple-mono text-[var(--apple-secondary-label)]">
                          {epic.progress?.storiesCompleted ?? 0}/{epic.progress?.totalStories ?? 0} stories
                        </span>
                      </div>
                      <GradientProgress
                        pct={pct}
                        colorIndex={displayedEpics.indexOf(epic)}
                        showPct={true}
                      />
                    </div>

                    {/* Meta info */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      <MetaChip
                        icon={<Target className="h-3.5 w-3.5" />}
                        label={epic.project?.name || "—"}
                      />
                      {epic.dueDate && (
                        <MetaChip
                          icon={<Calendar className="h-3.5 w-3.5" />}
                          label={`Due ${formatDate(epic.dueDate)}`}
                        />
                      )}
                      {epic.storyPoints && (
                        <MetaChip
                          icon={<BarChart3 className="h-3.5 w-3.5" />}
                          label={`${epic.storyPoints} pts`}
                        />
                      )}
                      {epic.assignedTo && (
                        <MetaChip
                          icon={<User className="h-3.5 w-3.5" />}
                          label={`${epic.assignedTo.firstName} ${epic.assignedTo.lastName}`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── List View ── */
          <div className="space-y-2">
            {displayedEpics.map((epic) => {
              const viewAllowed = canViewEpic(epic);
              const editAllowed = canEditEpic(epic);
              const deleteAllowed = canDeleteEpic(epic);

              return (
                <div
                  key={epic._id}
                  className={cn(
                    "card-fade-in group flex items-start gap-4 p-4 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card",
                    "apple-transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.32)] hover:-translate-y-px",
                    viewAllowed ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
                  )}
                  onClick={() => viewAllowed && router.push(`/epics/${epic._id}`)}
                >
                  {/* Icon */}
                  <div className="h-10 w-10 rounded-[var(--apple-radius-md)] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 2px 8px var(--apple-chart-glow)' }}>
                    <Layers className="h-5 w-5 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-[var(--apple-label)] truncate">
                        {epic.title}
                      </h3>
                      <StatusBadge status={epic.status} size="sm" />
                      <PriorityBadge priority={epic.priority} size="sm" />
                    </div>
                    {epic.description && (
                      <p className="text-[13px] text-[var(--apple-secondary-label)] line-clamp-1">
                        {epic.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                      <MetaChip
                        icon={<Target className="h-3.5 w-3.5" />}
                        label={epic.project?.name || "—"}
                      />
                      {epic.dueDate && (
                        <MetaChip
                          icon={<Calendar className="h-3.5 w-3.5" />}
                          label={formatDate(epic.dueDate)}
                        />
                      )}
                      <MetaChip
                        icon={<BarChart3 className="h-3.5 w-3.5" />}
                        label={`${epic.progress?.storiesCompleted ?? 0}/${epic.progress?.totalStories ?? 0} stories`}
                      />
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-28 flex-shrink-0 hidden md:block pt-1">
                    <GradientProgress
                      pct={epic.progress?.completionPercentage ?? 0}
                      showPct={true}
                    />
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)] sm:opacity-0 sm:group-hover:opacity-100 apple-transition flex-shrink-0"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!viewAllowed}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!viewAllowed) return;
                          router.push(`/epics/${epic._id}`);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Epic
                      </DropdownMenuItem>
                      {editAllowed && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/epics/${epic._id}/edit`);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Epic
                        </DropdownMenuItem>
                      )}
                      {deleteAllowed && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(epic);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Epic
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {displayedEpics.length > 0 && !localSearch && (
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalEpicsCount}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false);
          setSelectedEpic(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Epic"
        description={`Are you sure you want to delete "${selectedEpic?.title}"? This action cannot be undone.`}
        confirmText={deleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        variant="destructive"
      />
    </MainLayout>
  );
}
