// Permission system definitions for Kanvaro
export enum PermissionCategory {
  // System permissions
  SYSTEM = 'system',
  // User management permissions
  USER = 'user',
  // Organization permissions
  ORGANIZATION = 'organization',
  // Project permissions
  PROJECT = 'project',
  // Task permissions
  TASK = 'task',
  // Team permissions
  TEAM = 'team',
  // Time tracking permissions
  TIME_TRACKING = 'time_tracking',
  // Financial permissions
  FINANCIAL = 'financial',
  // Reporting permissions
  REPORTING = 'reporting',
  // Settings permissions
  SETTINGS = 'settings',
  // Epic permissions
  EPIC = 'epic',
  // Sprint permissions
  SPRINT = 'sprint',
  // Story permissions
  STORY = 'story',
  // Calendar permissions
  CALENDAR = 'calendar',
  // Kanban permissions
  KANBAN = 'kanban',
  // backlog permissions
  BACKLOG = 'backlog',
  // Test management permissions
  TEST_MANAGEMENT = 'test_management',

  // Sprint stand-up permissions
  STANDUP = 'standup',

  // Documentation permissions
  DOCUMENTATION = 'documentation',
}

export enum Permission {
  // System permissions
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_MONITOR = 'system:monitor',
  SYSTEM_MAINTENANCE = 'system:maintenance',
  // User management permissions
  USER_CREATE = 'user:create',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_INVITE = 'user:invite',
  USER_ACTIVATE = 'user:activate',
  USER_DEACTIVATE = 'user:deactivate',
  USER_MANAGE_ROLES = 'user:manage_roles',

  // Organization permissions
  ORGANIZATION_READ = 'organization:read',
  ORGANIZATION_UPDATE = 'organization:update',
  ORGANIZATION_DELETE = 'organization:delete',
  ORGANIZATION_MANAGE_SETTINGS = 'organization:manage_settings',
  ORGANIZATION_MANAGE_BILLING = 'organization:manage_billing',

  // Project permissions
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',
  PROJECT_MANAGE_TEAM = 'project:manage_team',
  PROJECT_MANAGE_BUDGET = 'project:manage_budget',
  PROJECT_ARCHIVE = 'project:archive',
  PROJECT_RESTORE = 'project:restore',
  PROJECT_VIEW_ALL = 'project:view_all', // Admin can see all projects

  // Task permissions
  TASK_CREATE = 'task:create',
  TASK_READ = 'task:read',
  TASK_UPDATE = 'task:update',
  TASK_DELETE = 'task:delete',
  TASK_ASSIGN = 'task:assign',
  TASK_CHANGE_STATUS = 'task:change_status',
  TASK_MANAGE_COMMENTS = 'task:manage_comments',
  TASK_MANAGE_ATTACHMENTS = 'task:manage_attachments',
  TASK_VIEW_ALL = 'task:view_all',
  TASK_EDIT_ALL = 'task:edit_all',
  TASK_DELETE_ALL = 'task:delete_all',
  TASK_VIEW_ASSIGNED_PROJECTS = 'task:view_assigned_projects',
  TASK_EDIT_ASSIGNED_PROJECTS = 'task:edit_assigned_projects',

  // Team permissions
  TEAM_READ = 'team:read',
  TEAM_INVITE = 'team:invite',
  TEAM_EDIT = 'team:edit',
  TEAM_DELETE = 'team:delete',
  TEAM_REMOVE = 'team:remove',
  TEAM_MANAGE_PERMISSIONS = 'team:manage_permissions',
  TEAM_VIEW_ACTIVITY = 'team:view_activity',
  TEAM_MEMBER_WIDGET_VIEW = 'team_member_widget:view',

  // Time tracking permissions
  TIME_TRACKING_CREATE = 'time_tracking:create',
  TIME_TRACKING_READ = 'time_tracking:read',
  TIME_TRACKING_UPDATE = 'time_tracking:update',
  TIME_TRACKING_DELETE = 'time_tracking:delete',
  TIME_TRACKING_APPROVE = 'time_tracking:approve',
  TIME_TRACKING_EXPORT = 'time_tracking:export',
  TIME_TRACKING_VIEW_ALL = 'time_tracking:view_all',
  // View time of users assigned to you (as PM or HR partner)
  TIME_TRACKING_VIEW_ASSIGNED = 'time_tracking:view_assigned',
  TIME_TRACKING_EMPLOYEE_FILTER_READ = 'time_tracking:employee_filter:read',
  TIME_TRACKING_VIEW_ALL_TIMER = 'time_tracking:view_all_timer',
  TIME_TRACKING_BULK_UPLOAD_ALL = 'time_tracking:bulk_upload_all',

  // Financial permissions
  FINANCIAL_READ = 'financial:read',
  FINANCIAL_MANAGE_BUDGET = 'financial:manage_budget',
  BUDGET_HANDLING = 'financial:budget_handling',
  FINANCIAL_CREATE_EXPENSE = 'financial:create_expense',
  FINANCIAL_APPROVE_EXPENSE = 'financial:approve_expense',
  FINANCIAL_VIEW_INCOME = 'financial:view_income',
  FINANCIAL_CREATE_INCOME = 'financial:create_income',
  FINANCIAL_CREATE_INVOICE = 'financial:create_invoice',
  FINANCIAL_SEND_INVOICE = 'financial:send_invoice',
  FINANCIAL_MANAGE_PAYMENTS = 'financial:manage_payments',

  // Reporting permissions
  REPORTING_VIEW = 'reporting:view',
  REPORTING_CREATE = 'reporting:create',
  REPORTING_EXPORT = 'reporting:export',
  REPORTING_SHARE = 'reporting:share',
  TIME_LOG_REPORT_ACCESS = 'time_tracking:report_access',

  // Settings permissions
  SETTINGS_VIEW = 'settings:view',
  SETTINGS_UPDATE = 'settings:update',
  SETTINGS_MANAGE_EMAIL = 'settings:manage_email',
  SETTINGS_MANAGE_DATABASE = 'settings:manage_database',
  SETTINGS_MANAGE_SECURITY = 'settings:manage_security',

  // Epic permissions
  EPIC_CREATE = 'epic:create',
  EPIC_VIEW = 'epic:view',
  EPIC_READ = 'epic:read',
  EPIC_UPDATE = 'epic:update',
  EPIC_EDIT = 'epic:edit',
  EPIC_DELETE = 'epic:delete',
  EPIC_REMOVE = 'epic:remove',
  EPIC_VIEW_ALL = 'epic:view_all',

  // Sprint permissions
  SPRINT_CREATE = 'sprint:create',
  SPRINT_VIEW = 'sprint:view',
  SPRINT_READ = 'sprint:read',
  SPRINT_UPDATE = 'sprint:update',
  SPRINT_EDIT = 'sprint:edit',
  SPRINT_DELETE = 'sprint:delete',
  SPRINT_MANAGE = 'sprint:manage',
  SPRINT_VIEW_ALL = 'sprint:view_all',
  SPRINT_START = 'sprint:start',
  SPRINT_COMPLETE = 'sprint:complete',

  // Story permissions
  STORY_CREATE = 'story:create',
  STORY_READ = 'story:read',
  STORY_UPDATE = 'story:update',
  STORY_DELETE = 'story:delete',
  STORY_VIEW_ALL = 'story:view_all',
  STORY_MANAGE_ALL = 'story:manage_all',

  // Calendar permissions
  CALENDAR_READ = 'calendar:read',
  CALENDAR_CREATE = 'calendar:create',
  CALENDAR_UPDATE = 'calendar:update',
  CALENDAR_DELETE = 'calendar:delete',

  // Sprint Event permissions
  SPRINT_EVENT_VIEW_ALL = 'sprint_event:view_all',
  SPRINT_EVENT_VIEW = 'sprint_event:view',

  // Kanban permissions
  KANBAN_READ = 'kanban:read',
  KANBAN_MANAGE = 'kanban:manage',

  // backlog permissions
  BACKLOG_READ = 'backlog:read',
  BACKLOG_MANAGE = 'backlog:manage',

  // Test management permissions
  TEST_SUITE_CREATE = 'test_suite:create',
  TEST_SUITE_READ = 'test_suite:read',
  TEST_SUITE_UPDATE = 'test_suite:update',
  TEST_SUITE_DELETE = 'test_suite:delete',
  TEST_CASE_CREATE = 'test_case:create',
  TEST_CASE_READ = 'test_case:read',
  TEST_CASE_UPDATE = 'test_case:update',
  TEST_CASE_DELETE = 'test_case:delete',
  TEST_PLAN_CREATE = 'test_plan:create',
  TEST_PLAN_READ = 'test_plan:read',
  TEST_PLAN_UPDATE = 'test_plan:update',
  TEST_PLAN_DELETE = 'test_plan:delete',
  TEST_PLAN_MANAGE = 'test_plan:manage',
  TEST_EXECUTION_CREATE = 'test_execution:create',
  TEST_EXECUTION_READ = 'test_execution:read',
  TEST_EXECUTION_UPDATE = 'test_execution:update',
  TEST_REPORT_VIEW = 'test_report:view',
  TEST_REPORT_EXPORT = 'test_report:export',
  TEST_MANAGE = 'test:manage',

  // Stand-up permissions.
  // Modelled directly on the spec's §3.2 role matrix. Split finely because the
  // matrix draws real distinctions: a Team Member may edit their own allocation
  // rows before the stand-up starts but not assign work to others, and only an
  // Org Admin may approve a planning waiver.
  STANDUP_CONFIGURE = 'standup:configure',
  STANDUP_VIEW = 'standup:view',
  STANDUP_GENERATE = 'standup:generate',
  STANDUP_RUN = 'standup:run',
  STANDUP_COMPLETE = 'standup:complete',
  STANDUP_REOPEN = 'standup:reopen',
  STANDUP_ALLOCATE = 'standup:allocate',
  STANDUP_ALLOCATE_OWN = 'standup:allocate_own',
  STANDUP_OVERRIDE = 'standup:override',
  STANDUP_REVISE_ESTIMATE = 'standup:revise_estimate',
  STANDUP_CARRY_FORWARD_NOTE = 'standup:carry_forward_note',
  STANDUP_BLOCKER_RAISE = 'standup:blocker_raise',
  STANDUP_VIEW_DEBT = 'standup:view_debt',
  STANDUP_VIEW_OWN_DEBT = 'standup:view_own_debt',
  STANDUP_WRITE_OFF_DEBT = 'standup:write_off_debt',
  STANDUP_VIEW_ANALYTICS = 'standup:view_analytics',
  STANDUP_PLANNING_WAIVER = 'standup:planning_waiver',

  /**
   * Organisation-wide holiday calendar administration (plan DO-2).
   *
   * Separate from STANDUP_CONFIGURE because the scope differs: stand-up
   * configuration is per project, while a holiday set is shared by every
   * project in the organisation. Gating holiday routes on STANDUP_CONFIGURE let
   * a project manager — and a tester — edit the national holiday calendar for
   * teams they have nothing to do with, while HR, who actually holds the
   * published gazette, could not touch it at all.
   */
  HOLIDAY_MANAGE = 'holiday:manage',

  // Documentation permissions
  DOCUMENTATION_VIEW = 'documentation:view',
  DOCUMENTATION_SEARCH = 'documentation:search',
  DOCUMENTATION_CREATE = 'documentation:create',
  DOCUMENTATION_UPDATE = 'documentation:update',
  DOCUMENTATION_DELETE = 'documentation:delete',
  DOCUMENTATION_MANAGE_PERMISSIONS = 'documentation:manage_permissions',
}

export enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  HUMAN_RESOURCE = 'human_resource',
  PROJECT_MANAGER = 'project_manager',
  TEAM_MEMBER = 'team_member',
  CLIENT = 'client',
  VIEWER = 'viewer',
  QA_ENGINEER = 'qa_engineer',
  TESTER = 'tester',
}

export enum ProjectRole {
  PROJECT_MANAGER = 'project_manager',
  PROJECT_MEMBER = 'project_member',
  PROJECT_VIEWER = 'project_viewer',
  PROJECT_CLIENT = 'project_client',
  PROJECT_QA_LEAD = 'project_qa_lead',
  PROJECT_TESTER = 'project_tester',
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),

  [Role.ADMIN]: [
    // User management
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.USER_INVITE,
    Permission.USER_ACTIVATE,
    Permission.USER_DEACTIVATE,
    Permission.USER_MANAGE_ROLES,

    // Organization
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_MANAGE_SETTINGS,
    Permission.ORGANIZATION_MANAGE_BILLING,

    // Projects (can see all projects)
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_MANAGE_TEAM,
    Permission.PROJECT_MANAGE_BUDGET,
    Permission.PROJECT_ARCHIVE,
    Permission.PROJECT_RESTORE,
    Permission.PROJECT_VIEW_ALL,

    // Tasks
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_DELETE,
    Permission.TASK_ASSIGN,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,
    Permission.TASK_VIEW_ALL,
    Permission.TASK_EDIT_ALL,
    Permission.TASK_DELETE_ALL,

    // Team
    Permission.TEAM_READ,
    Permission.TEAM_INVITE,
    Permission.TEAM_EDIT,
    Permission.TEAM_REMOVE,
    Permission.TEAM_MANAGE_PERMISSIONS,
    Permission.TEAM_VIEW_ACTIVITY,
    Permission.TEAM_MEMBER_WIDGET_VIEW,

    // Time tracking
    Permission.TIME_TRACKING_CREATE,
    Permission.TIME_TRACKING_READ,
    Permission.TIME_TRACKING_UPDATE,
    Permission.TIME_TRACKING_DELETE,
    Permission.TIME_TRACKING_APPROVE,
    Permission.TIME_TRACKING_EXPORT,
    Permission.TIME_TRACKING_VIEW_ALL,
    Permission.TIME_TRACKING_EMPLOYEE_FILTER_READ,
    Permission.TIME_TRACKING_VIEW_ALL_TIMER,

    // Financial
    Permission.FINANCIAL_READ,
    Permission.FINANCIAL_MANAGE_BUDGET,
    Permission.BUDGET_HANDLING,
    Permission.FINANCIAL_CREATE_EXPENSE,
    Permission.FINANCIAL_APPROVE_EXPENSE,
    Permission.FINANCIAL_VIEW_INCOME,
    Permission.FINANCIAL_CREATE_INCOME,
    Permission.FINANCIAL_CREATE_INVOICE,
    Permission.FINANCIAL_SEND_INVOICE,
    Permission.FINANCIAL_MANAGE_PAYMENTS,

    // Reporting
    Permission.REPORTING_CREATE,
    Permission.REPORTING_EXPORT,
    Permission.REPORTING_SHARE,
    Permission.TIME_LOG_REPORT_ACCESS,
    Permission.REPORTING_VIEW,

    // Settings
    Permission.SETTINGS_VIEW,
    Permission.SETTINGS_UPDATE,
    Permission.SETTINGS_MANAGE_EMAIL,
    Permission.SETTINGS_MANAGE_DATABASE,
    Permission.SETTINGS_MANAGE_SECURITY,

    // Epics
    Permission.EPIC_CREATE,
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,
    Permission.EPIC_EDIT,
    Permission.EPIC_UPDATE,
    Permission.EPIC_DELETE,
    Permission.EPIC_REMOVE,
    Permission.EPIC_VIEW_ALL,

    // Sprints
    Permission.SPRINT_CREATE,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.SPRINT_UPDATE,
    Permission.SPRINT_EDIT,
    Permission.SPRINT_DELETE,
    Permission.SPRINT_MANAGE,
    Permission.SPRINT_VIEW_ALL,
    Permission.SPRINT_START,
    Permission.SPRINT_COMPLETE,

    // Stories
    Permission.STORY_CREATE,
    Permission.STORY_READ,
    Permission.STORY_UPDATE,
    Permission.STORY_DELETE,
    Permission.STORY_VIEW_ALL,

    // Calendar
    Permission.CALENDAR_READ,
    Permission.CALENDAR_CREATE,
    Permission.CALENDAR_UPDATE,
    Permission.CALENDAR_DELETE,

    // Sprint Events
    Permission.SPRINT_EVENT_VIEW_ALL,
    Permission.SPRINT_EVENT_VIEW,

    // Kanban
    Permission.KANBAN_READ,
    Permission.KANBAN_MANAGE,

    // backlog
    Permission.BACKLOG_READ,
    Permission.BACKLOG_MANAGE,

    // Test management
    Permission.TEST_SUITE_CREATE,
    Permission.TEST_SUITE_READ,
    Permission.TEST_SUITE_UPDATE,
    Permission.TEST_SUITE_DELETE,
    Permission.TEST_CASE_CREATE,
    Permission.TEST_CASE_READ,
    Permission.TEST_CASE_UPDATE,
    Permission.TEST_CASE_DELETE,
    Permission.TEST_PLAN_CREATE,
    Permission.TEST_PLAN_READ,
    Permission.TEST_PLAN_UPDATE,
    Permission.TEST_PLAN_DELETE,
    Permission.TEST_PLAN_MANAGE,
    Permission.TEST_EXECUTION_CREATE,
    Permission.TEST_EXECUTION_READ,
    Permission.TEST_EXECUTION_UPDATE,
    Permission.TEST_REPORT_VIEW,
    Permission.TEST_REPORT_EXPORT,
    Permission.TEST_MANAGE,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
    Permission.DOCUMENTATION_CREATE,
    Permission.DOCUMENTATION_UPDATE,
    Permission.DOCUMENTATION_DELETE,
    Permission.DOCUMENTATION_UPDATE,
    Permission.DOCUMENTATION_DELETE,
    Permission.DOCUMENTATION_MANAGE_PERMISSIONS,

    // Stand-ups — Org Admin holds every capability in the §3.2 matrix,
    // including the planning waiver, which is Org Admin only (PLN-16).
    Permission.STANDUP_CONFIGURE,
    Permission.HOLIDAY_MANAGE,
    Permission.STANDUP_VIEW,
    Permission.STANDUP_GENERATE,
    Permission.STANDUP_RUN,
    Permission.STANDUP_COMPLETE,
    Permission.STANDUP_REOPEN,
    Permission.STANDUP_ALLOCATE,
    Permission.STANDUP_ALLOCATE_OWN,
    Permission.STANDUP_OVERRIDE,
    Permission.STANDUP_REVISE_ESTIMATE,
    Permission.STANDUP_CARRY_FORWARD_NOTE,
    Permission.STANDUP_BLOCKER_RAISE,
    Permission.STANDUP_VIEW_DEBT,
    Permission.STANDUP_VIEW_OWN_DEBT,
    Permission.STANDUP_WRITE_OFF_DEBT,
    Permission.STANDUP_VIEW_ANALYTICS,
    Permission.STANDUP_PLANNING_WAIVER,
  ],

  // Human Resource role - currently has the same permissions as ADMIN.
  // This can be fine-tuned later as needed.
  [Role.HUMAN_RESOURCE]: [
    // User management
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.USER_INVITE,
    Permission.USER_ACTIVATE,
    Permission.USER_DEACTIVATE,
    Permission.USER_MANAGE_ROLES,

    // Organization
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_MANAGE_SETTINGS,
    Permission.ORGANIZATION_MANAGE_BILLING,

    // Projects (can see all projects)
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    // Permission.PROJECT_DELETE,
    Permission.PROJECT_MANAGE_TEAM,
    Permission.PROJECT_MANAGE_BUDGET,
    Permission.PROJECT_ARCHIVE,
    Permission.PROJECT_RESTORE,
    Permission.PROJECT_VIEW_ALL,

    // Tasks
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_DELETE,
    Permission.TASK_ASSIGN,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,
    Permission.TASK_VIEW_ALL,
    Permission.TASK_EDIT_ALL,
    // Permission.TASK_DELETE_ALL,

    // Team
    Permission.TEAM_READ,
    Permission.TEAM_INVITE,
    Permission.TEAM_EDIT,
    // Permission.TEAM_DELETE,
    Permission.TEAM_REMOVE,
    Permission.TEAM_MANAGE_PERMISSIONS,
    Permission.TEAM_VIEW_ACTIVITY,
    Permission.TEAM_MEMBER_WIDGET_VIEW,

    // Time tracking
    Permission.TIME_TRACKING_CREATE,
    Permission.TIME_TRACKING_READ,
    Permission.TIME_TRACKING_UPDATE,
    Permission.TIME_TRACKING_DELETE,
    Permission.TIME_TRACKING_APPROVE,
    Permission.TIME_TRACKING_EXPORT,
    Permission.TIME_TRACKING_VIEW_ASSIGNED,
    Permission.TIME_TRACKING_VIEW_ALL,
    Permission.TIME_TRACKING_EMPLOYEE_FILTER_READ,
    Permission.TIME_TRACKING_VIEW_ALL_TIMER,
    Permission.TIME_TRACKING_BULK_UPLOAD_ALL,

    // Financial
    Permission.FINANCIAL_READ,
    Permission.FINANCIAL_MANAGE_BUDGET,
    Permission.BUDGET_HANDLING,
    Permission.FINANCIAL_CREATE_EXPENSE,
    Permission.FINANCIAL_APPROVE_EXPENSE,
    Permission.FINANCIAL_VIEW_INCOME,
    Permission.FINANCIAL_CREATE_INCOME,
    Permission.FINANCIAL_CREATE_INVOICE,
    Permission.FINANCIAL_SEND_INVOICE,

    // Reporting
    Permission.REPORTING_VIEW,
    Permission.REPORTING_CREATE,
    Permission.REPORTING_EXPORT,
    Permission.REPORTING_SHARE,
    Permission.TIME_LOG_REPORT_ACCESS,

    // Settings
    Permission.SETTINGS_VIEW,
    Permission.SETTINGS_UPDATE,
    Permission.SETTINGS_MANAGE_EMAIL,
    Permission.SETTINGS_MANAGE_DATABASE,
    Permission.SETTINGS_MANAGE_SECURITY,
    // Epics
    Permission.EPIC_CREATE,
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,
    Permission.EPIC_EDIT,
    Permission.EPIC_UPDATE,
    // Permission.EPIC_DELETE,
    Permission.EPIC_REMOVE,

    // Sprints
    Permission.SPRINT_CREATE,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.SPRINT_EDIT,
    Permission.SPRINT_UPDATE,
    // Permission.SPRINT_DELETE,
    Permission.SPRINT_MANAGE,
    Permission.SPRINT_START,
    Permission.SPRINT_COMPLETE,

    //Sprint Events
    Permission.SPRINT_EVENT_VIEW_ALL,
    Permission.SPRINT_EVENT_VIEW,

    // Stories
    Permission.STORY_CREATE,
    Permission.STORY_READ,
    Permission.STORY_UPDATE,
    // Permission.STORY_DELETE,

    Permission.STORY_MANAGE_ALL,

    // Calendar
    Permission.CALENDAR_READ,
    Permission.CALENDAR_CREATE,
    Permission.CALENDAR_UPDATE,
    Permission.CALENDAR_DELETE,
    Permission.HOLIDAY_MANAGE,
    // Organisation-wide on purpose, unlike every other non-admin role: HR owns
    // the holiday calendar for the whole organisation, and HOLIDAY_COVERAGE_GAP
    // — the notice saying a sprint runs past the last loaded holiday — is
    // served by the stand-up health route, which is gated on STANDUP_VIEW. HR
    // cannot be asked to close a gap it is not allowed to see. Read only: the
    // attendee permissions come from HR's project role when HR is actually on
    // a project.
    Permission.STANDUP_VIEW,

    // Kanban
    Permission.KANBAN_READ,
    Permission.KANBAN_MANAGE,

    // backlog
    Permission.BACKLOG_READ,
    Permission.BACKLOG_MANAGE,

    // Test Management
    // Permission.TEST_SUITE_CREATE,
    // Permission.TEST_SUITE_READ,
    // Permission.TEST_SUITE_UPDATE,
    // Permission.TEST_SUITE_DELETE,
    // Permission.TEST_CASE_CREATE,
    // Permission.EPIC_VIEW_ALL,
    // Permission.TEST_CASE_READ,
    // Permission.TEST_CASE_UPDATE,
    // Permission.TEST_CASE_DELETE,
    // Permission.TEST_PLAN_CREATE,
    // Permission.TEST_PLAN_READ,
    // Permission.TEST_PLAN_UPDATE,
    // Permission.TEST_PLAN_DELETE,
    // Permission.TEST_PLAN_MANAGE,
    // Permission.TEST_EXECUTION_CREATE,
    // Permission.TEST_EXECUTION_READ,
    // Permission.TEST_EXECUTION_UPDATE,
    // Permission.SPRINT_VIEW_ALL,
    // Permission.TEST_REPORT_VIEW,
    // Permission.TEST_REPORT_EXPORT,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
    Permission.STORY_VIEW_ALL,
    Permission.DOCUMENTATION_CREATE,
    Permission.DOCUMENTATION_UPDATE,
    Permission.DOCUMENTATION_DELETE,
  ],

  [Role.PROJECT_MANAGER]: [
    // Stand-ups — every capability except the planning waiver, which the §3.2
    // matrix reserves for Org Admin. SEC-2: any PM on the project may run the
    // stand-up; whoever starts it becomes facilitator but the rest keep full
    // edit rights, so this is a plain role grant with no ownership check.
    Permission.STANDUP_CONFIGURE,
    Permission.STANDUP_VIEW,
    Permission.STANDUP_GENERATE,
    Permission.STANDUP_RUN,
    Permission.STANDUP_COMPLETE,
    Permission.STANDUP_REOPEN,
    Permission.STANDUP_ALLOCATE,
    Permission.STANDUP_ALLOCATE_OWN,
    Permission.STANDUP_OVERRIDE,
    Permission.STANDUP_REVISE_ESTIMATE,
    Permission.STANDUP_CARRY_FORWARD_NOTE,
    Permission.STANDUP_BLOCKER_RAISE,
    Permission.STANDUP_VIEW_DEBT,
    Permission.STANDUP_VIEW_OWN_DEBT,
    Permission.STANDUP_WRITE_OFF_DEBT,
    Permission.STANDUP_VIEW_ANALYTICS,

    // User management
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    // Permission.USER_DELETE,
    Permission.USER_INVITE,
    Permission.USER_ACTIVATE,
    Permission.USER_DEACTIVATE,
    Permission.USER_MANAGE_ROLES,

    // Organization
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_MANAGE_SETTINGS,
    Permission.ORGANIZATION_MANAGE_BILLING,

    // Projects (can see all projects)
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    // Permission.PROJECT_DELETE,
    Permission.PROJECT_MANAGE_TEAM,
    Permission.PROJECT_MANAGE_BUDGET,
    Permission.PROJECT_ARCHIVE,
    Permission.PROJECT_RESTORE,
    Permission.PROJECT_VIEW_ALL,

    // Tasks
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_DELETE,
    Permission.TASK_ASSIGN,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,
    Permission.TASK_VIEW_ALL,
    Permission.TASK_EDIT_ALL,

    Permission.TASK_EDIT_ALL,


    // Team
    Permission.TEAM_READ,
    Permission.TEAM_INVITE,
    // Permission.TEAM_DELETE,
    // Permission.TEAM_REMOVE,
    Permission.TEAM_MANAGE_PERMISSIONS,
    Permission.TEAM_VIEW_ACTIVITY,
    Permission.TEAM_MEMBER_WIDGET_VIEW,

    // Time tracking
    Permission.TIME_TRACKING_CREATE,
    Permission.TIME_TRACKING_READ,
    Permission.TIME_TRACKING_APPROVE,
    Permission.TIME_TRACKING_EXPORT,
    Permission.TIME_TRACKING_VIEW_ALL,
    Permission.TIME_TRACKING_EMPLOYEE_FILTER_READ,
    Permission.TIME_TRACKING_VIEW_ALL_TIMER,

    // Financial
    Permission.FINANCIAL_READ,
    Permission.FINANCIAL_MANAGE_BUDGET,
    Permission.FINANCIAL_CREATE_EXPENSE,
    Permission.FINANCIAL_APPROVE_EXPENSE,
    Permission.FINANCIAL_VIEW_INCOME,
    Permission.FINANCIAL_CREATE_INCOME,
    Permission.FINANCIAL_CREATE_INVOICE,
    Permission.FINANCIAL_SEND_INVOICE,
    Permission.FINANCIAL_MANAGE_PAYMENTS,

    //testing
    // Permission.TEST_MANAGE,


    // Reporting
    Permission.REPORTING_VIEW,
    Permission.REPORTING_CREATE,
    Permission.REPORTING_EXPORT,
    Permission.REPORTING_SHARE,
    Permission.TIME_LOG_REPORT_ACCESS,

    // Settings
    Permission.SETTINGS_UPDATE,
    Permission.SETTINGS_MANAGE_EMAIL,
    Permission.SETTINGS_MANAGE_DATABASE,
    Permission.SETTINGS_MANAGE_SECURITY,

    // Epics
    Permission.EPIC_CREATE,
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,
    Permission.EPIC_EDIT,
    Permission.EPIC_UPDATE,
    // Permission.EPIC_DELETE,
    Permission.EPIC_REMOVE,
    Permission.EPIC_VIEW_ALL,

    // Sprints
    Permission.SPRINT_CREATE,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.SPRINT_EDIT,
    Permission.SPRINT_UPDATE,
    Permission.SPRINT_DELETE,
    Permission.SPRINT_MANAGE,
    Permission.SPRINT_VIEW_ALL,
    Permission.SPRINT_START,
    Permission.SPRINT_COMPLETE,

    // Stories
    Permission.STORY_CREATE,
    Permission.STORY_READ,
    Permission.STORY_UPDATE,
    // Permission.STORY_DELETE,
    Permission.STORY_VIEW_ALL,
    Permission.STORY_MANAGE_ALL,

    // Calendar
    Permission.CALENDAR_READ,
    Permission.CALENDAR_CREATE,
    Permission.CALENDAR_UPDATE,
    Permission.CALENDAR_DELETE,

    // Sprint Events
    Permission.SPRINT_EVENT_VIEW_ALL,
    Permission.SPRINT_EVENT_VIEW,


    // Kanban
    Permission.KANBAN_READ,
    Permission.KANBAN_MANAGE,

    // backlog
    Permission.BACKLOG_READ,
    Permission.BACKLOG_MANAGE,

    // Test management
    // Permission.TEST_SUITE_CREATE,
    // Permission.TEST_SUITE_READ,
    // Permission.TEST_SUITE_UPDATE,
    // Permission.TEST_SUITE_DELETE,
    // Permission.TEST_CASE_CREATE,
    // Permission.TEST_CASE_READ,
    // Permission.TEST_CASE_UPDATE,
    // Permission.TEST_CASE_DELETE,
    // Permission.TEST_PLAN_CREATE,
    // Permission.TEST_PLAN_READ,
    // Permission.TEST_PLAN_UPDATE,
    // Permission.TEST_PLAN_DELETE,
    // Permission.TEST_PLAN_MANAGE,
    // Permission.TEST_EXECUTION_CREATE,
    // Permission.TEST_EXECUTION_READ,
    // Permission.TEST_EXECUTION_UPDATE,
    // Permission.TEST_REPORT_VIEW,
    // Permission.TEST_REPORT_EXPORT,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
    Permission.DOCUMENTATION_CREATE,
    Permission.DOCUMENTATION_UPDATE,
    Permission.DOCUMENTATION_DELETE,
  ],

  [Role.TEAM_MEMBER]: [
    // Stand-ups are granted per project, NOT here — see PROJECT_MEMBER.
    //
    // A grant in this table is organisation-wide: `hasPermission` returns true
    // for a PROJECT-scoped permission as soon as the org role holds it, without
    // ever consulting the project (permission-service.ts). Listing STANDUP_VIEW
    // here therefore let every team member in the organisation read every
    // stand-up in it — including capacity gaps and estimate debt for projects
    // they are not on. A member of a project resolves to PROJECT_MEMBER, which
    // carries the §3.2 Team Member set scoped to that project, so the
    // capability is unchanged and the reach is not.

    // User management (own profile only)
    Permission.USER_READ,
    Permission.USER_UPDATE,

    // Organization (read only)
    Permission.ORGANIZATION_READ,

    // Projects (assigned projects only)
    Permission.PROJECT_READ,

    // Tasks (assigned tasks only)
    Permission.TASK_READ,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,

    // User Stories (assigned stories only)
    Permission.STORY_READ,

    // Team (read only)
    Permission.TEAM_READ,
    Permission.TEAM_VIEW_ACTIVITY,


    // Time tracking (own time)
    Permission.TIME_TRACKING_CREATE,
    Permission.TIME_TRACKING_READ,

    // Financial (read only)
    Permission.FINANCIAL_READ,

    // Reporting (limited)
    Permission.REPORTING_VIEW,

    // Settings (own settings)

    // Epics (read only)
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,

    // Sprints (read only)
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,

    // Stories (read only)
    Permission.STORY_READ,

    // Calendar (read only)
    Permission.CALENDAR_READ,

    // Kanban (read only)
    Permission.KANBAN_READ,

    // backlog (read only)
    Permission.BACKLOG_READ,

    //sprint event
    Permission.SPRINT_EVENT_VIEW,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
  ],

  [Role.CLIENT]: [
    // User management (own profile only)
    Permission.USER_READ,

    // Organization (read only)
    Permission.ORGANIZATION_READ,

    // Projects (assigned projects only)
    Permission.PROJECT_READ,

    // Tasks (read only)
    Permission.TASK_READ,

    // Team (read only)
    Permission.TEAM_READ,

    // Time tracking (read only)
    Permission.TIME_TRACKING_READ,

    // Financial (read only)
    Permission.FINANCIAL_READ,

    // Reporting (read only)
    Permission.REPORTING_VIEW,

    // Settings (own settings)

    // Epics (read only)
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,

    // Sprints (read only)
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,

    // Stories (read only)
    Permission.STORY_READ,

    // Calendar (read only)
    Permission.CALENDAR_READ,

    // Kanban (read only)
    Permission.KANBAN_READ,

    // backlog (read only)
    Permission.BACKLOG_READ,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
  ],

  [Role.VIEWER]: [
    // Stand-ups — the spec's read-only "Stakeholder". Deliberately has
    // STANDUP_VIEW_ANALYTICS but NOT STANDUP_VIEW_DEBT: NFR-13 requires
    // individual estimate debt and estimation accuracy to be invisible to
    // stakeholders, who see team aggregates only. The analytics payload filters
    // on this at field level, not just in the UI.
    Permission.STANDUP_VIEW,
    Permission.STANDUP_VIEW_ANALYTICS,

    // User management (own profile only)
    Permission.USER_READ,

    // Organization (read only)
    Permission.ORGANIZATION_READ,

    // Projects (assigned projects only)
    Permission.PROJECT_READ,

    // Tasks (read only)
    Permission.TASK_READ,

    // Team (read only)
    Permission.TEAM_READ,

    // Time tracking (read only)
    Permission.TIME_TRACKING_READ,

    // Financial (read only)
    Permission.FINANCIAL_READ,

    // Reporting (read only)
    Permission.REPORTING_VIEW,

    // Settings (own settings)

    // Epics (read only)
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,

    // Sprints (read only)
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,

    // Stories (read only)
    Permission.STORY_READ,

    // Calendar (read only)
    Permission.CALENDAR_READ,

    // Kanban (read only)
    Permission.KANBAN_READ,

    // backlog (read only)
    Permission.BACKLOG_READ,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
  ],

  [Role.QA_ENGINEER]: [
    // Stand-ups are granted per project, NOT here — see PROJECT_QA_LEAD and
    // PROJECT_MEMBER. A grant here would be organisation-wide; see the note on
    // TEAM_MEMBER.

    // User management (read only)
    Permission.USER_READ,
    Permission.USER_UPDATE,


    // Organization (read only)
    Permission.ORGANIZATION_READ,

    // Projects (assigned projects only)
    Permission.PROJECT_READ,

    // Tasks (full access for bug management)
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_DELETE,
    Permission.TASK_ASSIGN,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,
    Permission.TASK_VIEW_ASSIGNED_PROJECTS,
    Permission.TASK_EDIT_ASSIGNED_PROJECTS,
    // Permission.TASK_DELETE_ALL,

    // Team (read only)
    Permission.TEAM_READ,

    // Time tracking (read only)
    Permission.TIME_TRACKING_READ,

    // Financial (read only)
    Permission.FINANCIAL_READ,

    // Reporting (read only)
    Permission.REPORTING_VIEW,

    // Settings (own settings)

    // Epics (read only)
    Permission.EPIC_READ,

    // Sprints (read only)
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,

    // Stories (read only)
    Permission.STORY_READ,

    // Calendar (read only)
    Permission.CALENDAR_READ,

    // Kanban (read only)
    Permission.KANBAN_READ,

    // backlog (read only)
    Permission.BACKLOG_READ,

    // Test management (full test management permissions)
    Permission.TEST_SUITE_CREATE,
    Permission.TEST_SUITE_READ,
    Permission.TEST_SUITE_UPDATE,
    Permission.TEST_SUITE_DELETE,
    Permission.TEST_CASE_CREATE,
    Permission.TEST_CASE_READ,
    Permission.TEST_CASE_UPDATE,
    Permission.TEST_CASE_DELETE,
    Permission.TEST_PLAN_CREATE,
    Permission.TEST_PLAN_READ,
    Permission.TEST_PLAN_UPDATE,
    Permission.TEST_PLAN_DELETE,
    Permission.TEST_PLAN_MANAGE,
    Permission.TEST_EXECUTION_CREATE,
    Permission.TEST_EXECUTION_READ,
    Permission.TEST_EXECUTION_UPDATE,
    Permission.TEST_REPORT_VIEW,
    Permission.TEST_REPORT_EXPORT,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
  ],

  [Role.TESTER]: [
    // Stand-ups are granted per project, NOT here — see PROJECT_TESTER and
    // PROJECT_MEMBER. A grant here would be organisation-wide; see the note on
    // TEAM_MEMBER.

    // User management (read only)
    Permission.USER_READ,

    // Organization (read only)
    Permission.ORGANIZATION_READ,

    // Projects (assigned projects only)
    Permission.PROJECT_READ,

    // Tasks (create bugs only)
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,

    // Team (read only)
    Permission.TEAM_READ,

    // Time tracking (read only)
    Permission.TIME_TRACKING_READ,

    // Financial (read only)
    Permission.FINANCIAL_READ,

    // Reporting (read only)
    Permission.REPORTING_VIEW,

    // Settings (own settings)

    // Epics (read only)
    Permission.EPIC_READ,

    // Sprints (read only)
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,

    // Stories (read only)
    Permission.STORY_READ,

    // Calendar (read only)
    Permission.CALENDAR_READ,

    // Kanban (read only)
    Permission.KANBAN_READ,

    // backlog (read only)
    Permission.BACKLOG_READ,

    // Test management (execution and reporting only)
    Permission.TEST_SUITE_READ,
    Permission.TEST_CASE_READ,
    Permission.TEST_PLAN_READ,
    Permission.TEST_EXECUTION_CREATE,
    Permission.TEST_EXECUTION_READ,
    Permission.TEST_EXECUTION_UPDATE,
    Permission.TEST_REPORT_VIEW,

    // Documentation
    Permission.DOCUMENTATION_VIEW,
    Permission.DOCUMENTATION_SEARCH,
  ],
};

export const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, Permission[]> = {
  [ProjectRole.PROJECT_MANAGER]: [
    // Stand-ups — full facilitation rights on this project (SEC-2: any PM may
    // run it), minus the Org-Admin-only planning waiver.
    Permission.STANDUP_CONFIGURE,
    Permission.STANDUP_VIEW,
    Permission.STANDUP_GENERATE,
    Permission.STANDUP_RUN,
    Permission.STANDUP_COMPLETE,
    Permission.STANDUP_REOPEN,
    Permission.STANDUP_ALLOCATE,
    Permission.STANDUP_ALLOCATE_OWN,
    Permission.STANDUP_OVERRIDE,
    Permission.STANDUP_REVISE_ESTIMATE,
    Permission.STANDUP_CARRY_FORWARD_NOTE,
    Permission.STANDUP_BLOCKER_RAISE,
    Permission.STANDUP_VIEW_DEBT,
    Permission.STANDUP_VIEW_OWN_DEBT,
    Permission.STANDUP_WRITE_OFF_DEBT,
    Permission.STANDUP_VIEW_ANALYTICS,

    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_MANAGE_TEAM,
    Permission.PROJECT_MANAGE_BUDGET,
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    // Permission.TASK_DELETE,
    Permission.TASK_ASSIGN,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,
    Permission.TEAM_READ,
    Permission.TEAM_INVITE,
    Permission.TEAM_REMOVE,
    Permission.TIME_TRACKING_READ,
    Permission.TIME_TRACKING_APPROVE,
    Permission.TIME_TRACKING_EXPORT,
    Permission.TIME_TRACKING_EMPLOYEE_FILTER_READ,
    Permission.FINANCIAL_READ,
    Permission.FINANCIAL_MANAGE_BUDGET,
    Permission.FINANCIAL_VIEW_INCOME,
    Permission.FINANCIAL_CREATE_INCOME,
    Permission.EPIC_CREATE,
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,
    Permission.EPIC_EDIT,
    Permission.EPIC_UPDATE,
    // Permission.EPIC_DELETE,
    Permission.EPIC_REMOVE,
    Permission.SPRINT_CREATE,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.SPRINT_EDIT,
    Permission.SPRINT_UPDATE,
    Permission.SPRINT_DELETE,
    Permission.SPRINT_MANAGE,
    Permission.SPRINT_EVENT_VIEW,
    Permission.SPRINT_START,
    Permission.SPRINT_COMPLETE,
    Permission.STORY_CREATE,
    Permission.STORY_READ,
    Permission.STORY_UPDATE,
    // Permission.STORY_DELETE,
    Permission.CALENDAR_READ,
    Permission.CALENDAR_CREATE,
    Permission.CALENDAR_UPDATE,
    Permission.CALENDAR_DELETE,
    Permission.KANBAN_READ,
    Permission.KANBAN_MANAGE,
    Permission.BACKLOG_READ,
    Permission.BACKLOG_MANAGE,
  ],

  [ProjectRole.PROJECT_MEMBER]: [
    // Stand-ups — attends, maintains own row before the stand-up starts,
    // raises blockers, sees only their own debt (NFR-13 / D2).
    Permission.STANDUP_VIEW,
    Permission.STANDUP_ALLOCATE_OWN,
    Permission.STANDUP_BLOCKER_RAISE,
    Permission.STANDUP_VIEW_OWN_DEBT,
    Permission.STANDUP_VIEW_ANALYTICS,

    Permission.PROJECT_READ,
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TEAM_READ,
    Permission.TIME_TRACKING_CREATE,
    Permission.TIME_TRACKING_READ,
    Permission.FINANCIAL_READ,
    Permission.EPIC_READ,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.STORY_CREATE,
    Permission.STORY_READ,
    Permission.STORY_UPDATE,
    Permission.CALENDAR_READ,
    Permission.KANBAN_READ,
    Permission.BACKLOG_READ,
  ],

  [ProjectRole.PROJECT_VIEWER]: [
    // Stand-ups — read only. No STANDUP_VIEW_DEBT: stakeholders see team
    // aggregates only (NFR-13).
    Permission.STANDUP_VIEW,
    Permission.STANDUP_VIEW_ANALYTICS,

    Permission.PROJECT_READ,
    Permission.TASK_READ,
    Permission.TEAM_READ,
    Permission.TIME_TRACKING_READ,
    Permission.FINANCIAL_READ,
    Permission.EPIC_READ,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.STORY_READ,
    Permission.CALENDAR_READ,
    Permission.KANBAN_READ,
    Permission.BACKLOG_READ,
  ],

  [ProjectRole.PROJECT_CLIENT]: [
    Permission.PROJECT_READ,
    Permission.TASK_READ,
    Permission.TEAM_READ,
    Permission.TIME_TRACKING_READ,
    Permission.FINANCIAL_READ,
    Permission.EPIC_READ,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.STORY_READ,
    Permission.CALENDAR_READ,
    Permission.KANBAN_READ,
    Permission.BACKLOG_READ,
  ],

  [ProjectRole.PROJECT_QA_LEAD]: [
    // Stand-ups — attends as a sprint team member, maintains own row before
    // the stand-up starts, raises blockers, sees only their own debt
    // (NFR-13 / D2). Same set as a Team Member per §3.2.
    Permission.STANDUP_VIEW,
    Permission.STANDUP_ALLOCATE_OWN,
    Permission.STANDUP_BLOCKER_RAISE,
    Permission.STANDUP_VIEW_OWN_DEBT,
    Permission.STANDUP_VIEW_ANALYTICS,

    Permission.PROJECT_READ,
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_ASSIGN,
    Permission.TASK_CHANGE_STATUS,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,
    Permission.TEAM_READ,
    Permission.TIME_TRACKING_READ,
    Permission.FINANCIAL_READ,
    Permission.EPIC_READ,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.STORY_READ,
    Permission.CALENDAR_READ,
    Permission.KANBAN_READ,
    Permission.BACKLOG_READ,
    // Test management (full permissions for assigned project)
    Permission.TEST_SUITE_CREATE,
    Permission.TEST_SUITE_READ,
    Permission.TEST_SUITE_UPDATE,
    Permission.TEST_SUITE_DELETE,
    Permission.TEST_CASE_CREATE,
    Permission.TEST_CASE_READ,
    Permission.TEST_CASE_UPDATE,
    Permission.TEST_CASE_DELETE,
    Permission.TEST_PLAN_CREATE,
    Permission.TEST_PLAN_READ,
    Permission.TEST_PLAN_UPDATE,
    Permission.TEST_PLAN_DELETE,
    Permission.TEST_PLAN_MANAGE,
    Permission.TEST_EXECUTION_CREATE,
    Permission.TEST_EXECUTION_READ,
    Permission.TEST_EXECUTION_UPDATE,
    Permission.TEST_REPORT_VIEW,
    Permission.TEST_REPORT_EXPORT,
  ],

  [ProjectRole.PROJECT_TESTER]: [
    // Stand-ups — attends as a sprint team member, maintains own row before
    // the stand-up starts, raises blockers, sees only their own debt
    // (NFR-13 / D2). Same set as a Team Member per §3.2.
    Permission.STANDUP_VIEW,
    Permission.STANDUP_ALLOCATE_OWN,
    Permission.STANDUP_BLOCKER_RAISE,
    Permission.STANDUP_VIEW_OWN_DEBT,
    Permission.STANDUP_VIEW_ANALYTICS,

    Permission.PROJECT_READ,
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_MANAGE_COMMENTS,
    Permission.TASK_MANAGE_ATTACHMENTS,
    Permission.TEAM_READ,
    Permission.TIME_TRACKING_READ,
    Permission.FINANCIAL_READ,
    Permission.EPIC_READ,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.STORY_READ,
    Permission.CALENDAR_READ,
    Permission.KANBAN_READ,
    Permission.BACKLOG_READ,
    // Test management (execution and reporting only)
    Permission.TEST_SUITE_READ,
    Permission.TEST_SUITE_DELETE,
    Permission.TEST_CASE_READ,
    Permission.TEST_PLAN_READ,
    Permission.TEST_EXECUTION_CREATE,
    Permission.TEST_EXECUTION_READ,
    Permission.TEST_EXECUTION_UPDATE,
    Permission.TEST_REPORT_VIEW,
  ],
};

// Permission scopes
export enum PermissionScope {
  GLOBAL = 'global', // Organization-wide access
  PROJECT = 'project', // Project-specific access
  OWN = 'own', // Own resources only
}

// Helper function to get permission scope
export function getPermissionScope(permission: Permission): PermissionScope {
  const globalPermissions = [
    Permission.USER_CREATE,
    Permission.USER_DELETE,
    Permission.USER_INVITE, // Organization-wide permission to invite users
    Permission.USER_MANAGE_ROLES,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_DELETE,
    Permission.ORGANIZATION_MANAGE_SETTINGS,
    Permission.ORGANIZATION_MANAGE_BILLING,
    Permission.PROJECT_CREATE, // Project creation is a global permission
    Permission.PROJECT_VIEW_ALL,
    Permission.TASK_VIEW_ALL,
    Permission.TASK_EDIT_ALL,
    Permission.TASK_DELETE_ALL,
    Permission.TASK_VIEW_ASSIGNED_PROJECTS,
    Permission.TASK_EDIT_ASSIGNED_PROJECTS,
    Permission.EPIC_VIEW,
    Permission.EPIC_READ,
    Permission.STORY_VIEW_ALL,
    Permission.SPRINT_VIEW,
    Permission.SPRINT_READ,
    Permission.SPRINT_VIEW_ALL,
    Permission.EPIC_VIEW_ALL,
    Permission.SPRINT_EVENT_VIEW_ALL,
    Permission.TEAM_INVITE, // Organization-wide permission to invite team members
    Permission.TEAM_EDIT,
    Permission.TEAM_REMOVE,
    Permission.TEAM_DELETE,
    Permission.TIME_TRACKING_VIEW_ALL,
    Permission.TIME_TRACKING_VIEW_ASSIGNED,
    Permission.TIME_TRACKING_VIEW_ALL_TIMER, // View all active timers in organization
    Permission.FINANCIAL_READ,
    Permission.BUDGET_HANDLING,
    Permission.REPORTING_VIEW,
    Permission.REPORTING_CREATE,
    Permission.REPORTING_EXPORT,
    Permission.REPORTING_SHARE,
    Permission.SETTINGS_MANAGE_EMAIL,
    Permission.SETTINGS_MANAGE_DATABASE,
    Permission.SETTINGS_MANAGE_SECURITY,
    // Organisation-wide by design: a holiday set is shared by every project,
    // so there is no project to scope it to. Without this it fell through to
    // PROJECT scope, which only worked because the roles that hold it hold it
    // globally — a custom role granting it would have been scoped wrongly.
    Permission.HOLIDAY_MANAGE,
  ];

  const ownPermissions = [
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.TIME_TRACKING_CREATE,
    Permission.TIME_TRACKING_UPDATE,
    Permission.TIME_TRACKING_DELETE,
  ];

  if (globalPermissions.includes(permission)) {
    return PermissionScope.GLOBAL;
  }

  if (ownPermissions.includes(permission)) {
    return PermissionScope.OWN;
  }

  return PermissionScope.PROJECT;
}
