import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const apiRoot = path.join(repoRoot, 'src', 'app', 'api')
const outOpenApiPath = path.join(repoRoot, 'public', 'openapi.json')
const outPostmanPath = path.join(repoRoot, 'postman', 'kanvaro.postman_collection.json')

/**
 * Next.js route segment -> OpenAPI segment
 * - [id] -> {id}
 * - [...path] -> {path}
 * - [[...slug]] -> {slug}
 */
function segmentToOpenApi(seg) {
  if (seg.startsWith('[[...') && seg.endsWith(']]')) return `{${seg.slice('[[...'.length, -2)}}`
  if (seg.startsWith('[...') && seg.endsWith(']')) return `{${seg.slice('[...'.length, -1)}}`
  if (seg.startsWith('[') && seg.endsWith(']')) return `{${seg.slice(1, -1)}}`
  return seg
}

function titleCase(input) {
  return input
    .split(/[-_/\s]+/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function walkForRouteFiles(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkForRouteFiles(full, acc)
      continue
    }
    if (!entry.isFile()) continue
    if (/^route\.(ts|js|tsx|jsx)$/.test(entry.name)) {
      acc.push(full)
    }
  }
}

function filePathToApiPath(routeFile) {
  const relDir = path.relative(apiRoot, path.dirname(routeFile))
  const rawSegments = relDir.split(path.sep).filter(Boolean)
  const segments = rawSegments.map(segmentToOpenApi)
  return '/api' + (segments.length ? '/' + segments.join('/') : '')
}

function extractMethods(sourceText) {
  const methods = new Set()
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  for (const m of sourceText.matchAll(re)) methods.add(m[1])
  // Also support: export const GET = async ...
  const re2 = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  for (const m of sourceText.matchAll(re2)) methods.add(m[1])
  return [...methods]
}

function extractQueryParams(sourceText) {
  const params = new Set()
  const re = /searchParams\.(?:get|getAll)\(['"`]([^'"`]+)['"`]\)/g
  for (const m of sourceText.matchAll(re)) params.add(m[1])
  return [...params]
}

function extractBodyKeys(sourceText) {
  const keys = new Set()
  const re = /const\s*\{([^}]+)\}\s*=\s*await\s*(?:request|req)\.json\(\)/g
  for (const m of sourceText.matchAll(re)) {
    const raw = m[1]
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        // handle destructuring: a, b, c: alias, d = 1
        const name = part.split(':')[0].split('=')[0].trim()
        if (name) keys.add(name)
      })
  }
  return [...keys]
}

function guessTagFromPath(apiPath) {
  const seg = apiPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)[0]
  if (!seg) return 'Misc'
  const map = {
    auth: 'Auth',
    users: 'Users',
    roles: 'Roles',
    members: 'Members',
    organization: 'Organization',
    settings: 'Settings',
    projects: 'Projects',
    tasks: 'Tasks',
    stories: 'Stories',
    epics: 'Epics',
    sprints: 'Sprints',
    backlog: 'Backlog',
    kanban: 'Kanban',
    'time-tracking': 'Time Tracking',
    notifications: 'Notifications',
    uploads: 'Uploads',
    reports: 'Reports',
    calendar: 'Calendar',
    activity: 'Activity',
    search: 'Search',
    docs: 'Docs',
    templates: 'Templates',
    setup: 'Setup',
    cron: 'Cron',
    debug: 'Debug',
    health: 'Health',
    realtime: 'Realtime',
    budget: 'Budget',
    feedback: 'Feedback',
    contact: 'Contact',
    currencies: 'Currencies',
    'landing-page': 'Landing Page'
  }
  return map[seg] || titleCase(seg)
}

function resourceRefForPath(apiPath) {
  // Returns a schema ref (or null) to use as `data` for list/single requests.
  const seg = apiPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)[0]
  const map = {
    users: '#/components/schemas/User',
    projects: '#/components/schemas/Project',
    tasks: '#/components/schemas/Task',
    stories: '#/components/schemas/Story',
    epics: '#/components/schemas/Epic',
    sprints: '#/components/schemas/Sprint',
    notifications: '#/components/schemas/Notification',
    roles: '#/components/schemas/CustomRole',
    budget: '#/components/schemas/BudgetEntry',
    'time-tracking': '#/components/schemas/TimeEntry',
    currencies: '#/components/schemas/Currency'
  }
  return map[seg] || null
}

function buildSuccessEnvelopeSchema(dataSchema) {
  const base = { $ref: '#/components/schemas/ApiSuccess' }
  if (!dataSchema) return base
  return {
    allOf: [
      base,
      {
        type: 'object',
        properties: {
          data: dataSchema
        },
        required: ['data']
      }
    ]
  }
}

function buildErrorResponses() {
  const err = { $ref: '#/components/schemas/ApiError' }
  return {
    400: { description: 'Bad Request', content: { 'application/json': { schema: err } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: err } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: err } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: err } } },
    500: { description: 'Internal Server Error', content: { 'application/json': { schema: err } } }
  }
}

function guessSecurity(apiPath) {
  // Public endpoints:
  if (apiPath.startsWith('/api/auth/')) return []
  if (apiPath === '/api/health') return []
  if (apiPath.startsWith('/api/setup/')) return []
  if (apiPath.startsWith('/api/landing-page/')) return []
  if (apiPath.startsWith('/api/contact')) return []
  // Cron/debug are special:
  if (apiPath.startsWith('/api/cron/')) return [{ cronSecret: [] }]
  if (apiPath.startsWith('/api/debug/')) return [{ bearerAuth: [] }]
  // Default secured
  return [{ bearerAuth: [] }]
}

function buildComponents() {
  const ObjectId = {
    type: 'string',
    description: 'MongoDB ObjectId',
    example: '65f2c3b1b7c2dd4387c2f733'
  }

  const DateTime = {
    type: 'string',
    format: 'date-time',
    example: '2026-04-21T10:34:23.000Z'
  }

  const User = {
    type: 'object',
    properties: {
      _id: ObjectId,
      firstName: { type: 'string', example: 'Ava' },
      lastName: { type: 'string', example: 'Patel' },
      email: { type: 'string', format: 'email', example: 'ava@kanvaro.local' },
      role: {
        type: 'string',
        enum: ['admin', 'human_resource', 'project_manager', 'team_member', 'client', 'viewer', 'account_manager', 'qa_engineer', 'tester'],
        example: 'team_member'
      },
      memberId: { type: 'string', nullable: true, example: 'EMP-001' },
      customRole: { allOf: [ObjectId], nullable: true },
      projectManager: { allOf: [ObjectId], nullable: true },
      humanResourcePartner: { allOf: [ObjectId], nullable: true },
      organization: ObjectId,
      isActive: { type: 'boolean', example: true },
      avatar: { type: 'string', nullable: true, example: '/uploads/avatars/u1.png' },
      timezone: { type: 'string', example: 'UTC' },
      language: { type: 'string', example: 'en' },
      billingRate: { type: 'number', nullable: true, example: 120 },
      hourlyRate: { type: 'number', nullable: true, example: 85 },
      currency: { type: 'string', example: 'USD' },
      lastLogin: { allOf: [DateTime], nullable: true },
      emailVerified: { type: 'boolean', example: true },
      twoFactorEnabled: { type: 'boolean', example: false },
      projectRoles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            project: ObjectId,
            role: {
              type: 'string',
              enum: ['project_manager', 'project_member', 'project_viewer', 'project_client', 'project_account_manager', 'project_qa_lead', 'project_tester']
            },
            assignedBy: ObjectId,
            assignedAt: DateTime
          },
          required: ['project', 'role', 'assignedBy', 'assignedAt']
        }
      },
      preferences: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: ['light', 'dark', 'system'], example: 'system' },
          sidebarCollapsed: { type: 'boolean', example: false },
          dateFormat: { type: 'string', example: 'MM/DD/YYYY' },
          timeFormat: { type: 'string', enum: ['12h', '24h'], example: '12h' },
          notifications: {
            type: 'object',
            properties: {
              email: { type: 'boolean', example: true },
              inApp: { type: 'boolean', example: true },
              push: { type: 'boolean', example: false },
              taskReminders: { type: 'boolean', example: true },
              projectUpdates: { type: 'boolean', example: true },
              teamActivity: { type: 'boolean', example: false }
            }
          }
        }
      },
      security: {
        type: 'object',
        nullable: true,
        properties: {
          loginAlerts: { type: 'boolean', example: true },
          sessionTimeout: { type: 'number', example: 30 },
          requirePasswordChange: { type: 'boolean', example: false }
        }
      },
      createdAt: DateTime,
      updatedAt: DateTime
    },
    required: ['_id', 'firstName', 'lastName', 'email', 'role', 'organization', 'isActive', 'timezone', 'language', 'currency', 'emailVerified', 'twoFactorEnabled', 'projectRoles', 'preferences', 'createdAt', 'updatedAt']
  }

  const Project = {
    type: 'object',
    properties: {
      _id: ObjectId,
      name: { type: 'string', example: 'Website Revamp' },
      description: { type: 'string', nullable: true, example: 'Q2 redesign and performance improvements' },
      status: { type: 'string', enum: ['draft', 'planning', 'active', 'on_hold', 'completed', 'cancelled'], example: 'active' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], example: 'high' },
      isDraft: { type: 'boolean', example: false },
      isBillableByDefault: { type: 'boolean', example: true },
      organization: ObjectId,
      createdBy: ObjectId,
      projectNumber: { type: 'number', example: 42 },
      teamMembers: {
        type: 'array',
        items: {
          type: 'object',
          properties: { memberId: ObjectId, hourlyRate: { type: 'number', nullable: true, example: 90 } }
        }
      },
      memberRates: {
        type: 'array',
        items: { type: 'object', properties: { user: ObjectId, hourlyRate: { type: 'number', example: 85 } } }
      },
      client: { allOf: [ObjectId], nullable: true },
      projectRoles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            user: ObjectId,
            role: {
              type: 'string',
              enum: ['project_manager', 'project_member', 'project_viewer', 'project_client', 'project_account_manager', 'project_qa_lead', 'project_tester']
            },
            assignedBy: ObjectId,
            assignedAt: DateTime
          }
        }
      },
      startDate: { type: 'string', format: 'date', example: '2026-04-01' },
      endDate: { type: 'string', format: 'date', nullable: true, example: '2026-06-30' },
      budget: {
        type: 'object',
        nullable: true,
        properties: {
          total: { type: 'number', example: 50000 },
          spent: { type: 'number', example: 12000 },
          currency: { type: 'string', example: 'USD' },
          categories: {
            type: 'object',
            properties: {
              materials: { type: 'number', example: 2000 },
              overhead: { type: 'number', example: 3000 },
              external: { type: 'number', example: 1000 }
            }
          },
          lastUpdated: DateTime,
          updatedBy: { allOf: [ObjectId], nullable: true }
        }
      },
      accountManager: { allOf: [ObjectId], nullable: true },
      settings: {
        type: 'object',
        properties: {
          allowTimeTracking: { type: 'boolean', example: true },
          allowManualTimeSubmission: { type: 'boolean', example: true },
          allowExpenseTracking: { type: 'boolean', example: true },
          requireApproval: { type: 'boolean', example: false },
          notifications: {
            type: 'object',
            properties: {
              taskUpdates: { type: 'boolean', example: true },
              budgetAlerts: { type: 'boolean', example: true },
              deadlineReminders: { type: 'boolean', example: true }
            }
          },
          kanbanStatuses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', example: 'in_progress' },
                title: { type: 'string', example: 'In Progress' },
                color: { type: 'string', nullable: true, example: '#3b82f6' },
                order: { type: 'number', example: 2 }
              }
            }
          }
        }
      },
      tags: { type: 'array', items: { type: 'string' }, example: ['frontend', 'q2'] },
      customFields: { type: 'object', additionalProperties: true },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'spec.pdf' },
            url: { type: 'string', example: '/uploads/attachments/spec.pdf' },
            size: { type: 'number', example: 123456 },
            type: { type: 'string', example: 'application/pdf' },
            uploadedBy: ObjectId,
            uploadedAt: DateTime
          }
        }
      },
      externalLinks: {
        type: 'object',
        nullable: true,
        properties: {
          figma: { type: 'array', items: { type: 'string' } },
          documentation: { type: 'array', items: { type: 'string' } }
        }
      },
      versions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Sprint 12' },
            version: { type: 'string', example: 'v1.12.0' },
            description: { type: 'string', nullable: true, example: 'Regression pack for v1.12' },
            releaseDate: { type: 'string', format: 'date', nullable: true, example: '2026-05-20' },
            isReleased: { type: 'boolean', example: false },
            createdBy: ObjectId,
            createdAt: DateTime
          }
        }
      },
      archived: { type: 'boolean', example: false },
      createdAt: DateTime,
      updatedAt: DateTime
    },
    required: ['_id', 'name', 'status', 'priority', 'isDraft', 'isBillableByDefault', 'organization', 'createdBy', 'projectNumber', 'teamMembers', 'startDate', 'settings', 'tags', 'customFields', 'attachments', 'versions', 'archived', 'createdAt', 'updatedAt']
  }

  const Task = {
    type: 'object',
    properties: {
      _id: ObjectId,
      title: { type: 'string', example: 'Fix login redirect loop' },
      description: { type: 'string', nullable: true, example: 'Investigate redirect behavior when refresh token expires' },
      status: { type: 'string', example: 'in_progress', description: 'Project kanban status key' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], example: 'high' },
      isBillable: { type: 'boolean', example: true },
      type: { type: 'string', enum: ['bug', 'feature', 'improvement', 'task', 'subtask'], example: 'bug' },
      organization: ObjectId,
      project: ObjectId,
      taskNumber: { type: 'number', example: 128 },
      displayId: { type: 'string', example: 'PRJ-128' },
      story: { allOf: [ObjectId], nullable: true },
      epic: { allOf: [ObjectId], nullable: true },
      parentTask: { allOf: [ObjectId], nullable: true },
      assignedTo: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            user: ObjectId,
            firstName: { type: 'string', nullable: true, example: 'Ava' },
            lastName: { type: 'string', nullable: true, example: 'Patel' },
            email: { type: 'string', format: 'email', nullable: true, example: 'ava@kanvaro.local' },
            hourlyRate: { type: 'number', nullable: true, example: 85 }
          }
        }
      },
      createdBy: ObjectId,
      assignedBy: { allOf: [ObjectId], nullable: true },
      storyPoints: { type: 'number', nullable: true, example: 3 },
      dueDate: { type: 'string', format: 'date', nullable: true, example: '2026-05-01' },
      estimatedHours: { type: 'number', nullable: true, example: 6 },
      actualHours: { type: 'number', nullable: true, example: 2.5 },
      sprint: { allOf: [ObjectId], nullable: true },
      movedFromSprint: { allOf: [ObjectId], nullable: true },
      startDate: { allOf: [DateTime], nullable: true },
      completedAt: { allOf: [DateTime], nullable: true },
      labels: { type: 'array', items: { type: 'string' }, example: ['auth', 'bug'] },
      dependencies: { type: 'array', items: ObjectId },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'screenshot.png' },
            url: { type: 'string', example: '/uploads/attachments/screenshot.png' },
            size: { type: 'number', example: 45678 },
            type: { type: 'string', example: 'image/png' },
            uploadedBy: ObjectId,
            uploadedAt: DateTime
          }
        }
      },
      subtasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            _id: { allOf: [ObjectId], nullable: true },
            title: { type: 'string', example: 'Reproduce on staging' },
            description: { type: 'string', nullable: true, example: 'Use expired refresh token' },
            status: { type: 'string', example: 'todo' },
            isCompleted: { type: 'boolean', example: false },
            createdAt: { allOf: [DateTime], nullable: true },
            updatedAt: { allOf: [DateTime], nullable: true }
          }
        }
      },
      archived: { type: 'boolean', example: false },
      position: { type: 'number', example: 1000 },
      comments: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          properties: {
            _id: { allOf: [ObjectId], nullable: true },
            content: { type: 'string', example: 'I can reproduce this on Chrome.' },
            author: ObjectId,
            parentCommentId: { allOf: [ObjectId], nullable: true },
            mentions: { type: 'array', items: ObjectId },
            linkedIssues: { type: 'array', items: ObjectId },
            createdAt: DateTime,
            updatedAt: { allOf: [DateTime], nullable: true }
          }
        }
      },
      linkedTestCase: { allOf: [ObjectId], nullable: true },
      foundInVersion: { type: 'string', nullable: true, example: 'v1.30.0' },
      testExecutionId: { allOf: [ObjectId], nullable: true },
      createdAt: DateTime,
      updatedAt: DateTime
    },
    required: ['_id', 'title', 'status', 'priority', 'type', 'organization', 'project', 'taskNumber', 'displayId', 'createdBy', 'labels', 'dependencies', 'attachments', 'subtasks', 'archived', 'position', 'createdAt', 'updatedAt']
  }

  const Story = {
    type: 'object',
    properties: {
      _id: ObjectId,
      title: { type: 'string', example: 'As a user, I can reset my password' },
      description: { type: 'string', nullable: true },
      acceptanceCriteria: { type: 'array', items: { type: 'string' } },
      project: ObjectId,
      epic: { allOf: [ObjectId], nullable: true },
      createdBy: ObjectId,
      assignedTo: { allOf: [ObjectId], nullable: true },
      status: { type: 'string', enum: ['backlog', 'todo', 'inprogress', 'review', 'testing', 'done', 'cancelled'], example: 'todo' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], example: 'medium' },
      storyPoints: { type: 'number', nullable: true, example: 5 },
      estimatedHours: { type: 'number', nullable: true, example: 12 },
      actualHours: { type: 'number', nullable: true, example: 0 },
      sprint: { allOf: [ObjectId], nullable: true },
      startDate: { allOf: [DateTime], nullable: true },
      dueDate: { type: 'string', format: 'date', nullable: true },
      completedAt: { allOf: [DateTime], nullable: true },
      tags: { type: 'array', items: { type: 'string' } },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
            size: { type: 'number' },
            type: { type: 'string' },
            uploadedBy: ObjectId,
            uploadedAt: DateTime
          }
        }
      },
      archived: { type: 'boolean', example: false },
      createdAt: DateTime,
      updatedAt: DateTime
    }
  }

  const Epic = {
    type: 'object',
    properties: {
      _id: ObjectId,
      title: { type: 'string', example: 'Authentication Improvements' },
      description: { type: 'string', nullable: true },
      project: ObjectId,
      createdBy: ObjectId,
      assignedTo: { allOf: [ObjectId], nullable: true },
      status: { type: 'string', enum: ['backlog', 'todo', 'inprogress', 'review', 'testing', 'done', 'cancelled'], example: 'inprogress' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], example: 'high' },
      storyPoints: { type: 'number', nullable: true },
      estimatedHours: { type: 'number', nullable: true },
      actualHours: { type: 'number', nullable: true },
      startDate: { allOf: [DateTime], nullable: true },
      dueDate: { type: 'string', format: 'date', nullable: true },
      completedAt: { allOf: [DateTime], nullable: true },
      tags: { type: 'array', items: { type: 'string' } },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
            size: { type: 'number' },
            type: { type: 'string' },
            uploadedBy: ObjectId,
            uploadedAt: DateTime
          }
        }
      },
      archived: { type: 'boolean', example: false },
      createdAt: DateTime,
      updatedAt: DateTime
    }
  }

  const Sprint = {
    type: 'object',
    properties: {
      _id: ObjectId,
      name: { type: 'string', example: 'Sprint 12' },
      description: { type: 'string', nullable: true },
      organization: ObjectId,
      project: ObjectId,
      createdBy: ObjectId,
      status: { type: 'string', enum: ['planning', 'active', 'completed', 'cancelled'], example: 'active' },
      startDate: { type: 'string', format: 'date', example: '2026-04-15' },
      endDate: { type: 'string', format: 'date', example: '2026-04-29' },
      actualStartDate: { allOf: [DateTime], nullable: true },
      actualEndDate: { allOf: [DateTime], nullable: true },
      goal: { type: 'string', nullable: true, example: 'Stabilize auth flows and improve reporting' },
      velocity: { type: 'number', nullable: true, example: 30 },
      plannedVelocity: { type: 'number', nullable: true, example: 28 },
      actualVelocity: { type: 'number', nullable: true, example: 0 },
      capacity: { type: 'number', example: 240 },
      actualCapacity: { type: 'number', nullable: true },
      teamMembers: { type: 'array', items: ObjectId },
      stories: { type: 'array', items: ObjectId },
      tasks: { type: 'array', items: ObjectId },
      attachments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
            size: { type: 'number' },
            type: { type: 'string' },
            uploadedBy: ObjectId,
            uploadedAt: DateTime
          }
        }
      },
      archived: { type: 'boolean', example: false },
      createdAt: DateTime,
      updatedAt: DateTime
    }
  }

  const Notification = {
    type: 'object',
    properties: {
      _id: ObjectId,
      userId: ObjectId,
      organizationId: ObjectId,
      title: { type: 'string', example: 'Task assigned' },
      message: { type: 'string', example: 'You have been assigned to task "PRJ-128"' },
      read: { type: 'boolean', example: false },
      createdAt: DateTime,
      updatedAt: DateTime
    }
  }

  const CustomRole = {
    type: 'object',
    properties: {
      _id: ObjectId,
      name: { type: 'string', example: 'QA Lead' },
      description: { type: 'string', nullable: true },
      permissions: { type: 'array', items: { type: 'string' } },
      organization: ObjectId,
      createdAt: DateTime,
      updatedAt: DateTime
    }
  }

  const BudgetEntry = {
    type: 'object',
    properties: {
      _id: ObjectId,
      organization: ObjectId,
      project: { allOf: [ObjectId], nullable: true },
      category: { type: 'string', example: 'overhead' },
      amount: { type: 'number', example: 2500 },
      currency: { type: 'string', example: 'USD' },
      description: { type: 'string', nullable: true },
      date: { type: 'string', format: 'date', example: '2026-04-20' },
      createdBy: ObjectId,
      createdAt: DateTime,
      updatedAt: DateTime
    }
  }

  const Currency = {
    type: 'object',
    properties: {
      code: { type: 'string', example: 'USD' },
      name: { type: 'string', example: 'United States Dollar' },
      symbol: { type: 'string', example: '$' }
    },
    required: ['code', 'name', 'symbol']
  }

  const TimeEntry = {
    type: 'object',
    properties: {
      _id: ObjectId,
      organization: ObjectId,
      project: ObjectId,
      task: { allOf: [ObjectId], nullable: true },
      user: ObjectId,
      date: { type: 'string', format: 'date', example: '2026-04-21' },
      startTime: { allOf: [DateTime], nullable: true },
      endTime: { allOf: [DateTime], nullable: true },
      durationMinutes: { type: 'number', example: 90 },
      description: { type: 'string', nullable: true },
      billable: { type: 'boolean', example: true },
      status: { type: 'string', example: 'submitted' },
      createdAt: DateTime,
      updatedAt: DateTime
    }
  }

  const ApiSuccess = {
    type: 'object',
    description: 'Standard API success envelope. Some endpoints may include extra fields (e.g., pagination).',
    additionalProperties: true,
    properties: {
      success: { type: 'boolean', example: true },
      data: { type: 'object', additionalProperties: true }
    },
    required: ['success']
  }

  const ApiError = {
    type: 'object',
    description: 'Standard API error response. Many endpoints return { error } without a success flag.',
    additionalProperties: true,
    properties: {
      success: { type: 'boolean', example: false },
      error: { type: 'string', example: 'Insufficient permissions' },
      details: { type: 'object', additionalProperties: true, nullable: true }
    },
    required: ['error']
  }

  const AuthLoginRequest = {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email', example: 'ava@kanvaro.local' },
      password: { type: 'string', example: 'P@ssw0rd!' }
    },
    required: ['email', 'password']
  }

  const TaskCreateRequest = {
    type: 'object',
    properties: {
      title: { type: 'string', example: 'Fix login redirect loop' },
      description: { type: 'string', nullable: true, example: 'Investigate redirect behavior when refresh token expires' },
      status: { type: 'string', nullable: true, example: 'backlog' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], nullable: true, example: 'high' },
      type: { type: 'string', enum: ['bug', 'feature', 'improvement', 'task', 'subtask'], nullable: true, example: 'bug' },
      project: { $ref: '#/components/schemas/ObjectId' },
      story: { allOf: [{ $ref: '#/components/schemas/ObjectId' }], nullable: true },
      epic: { allOf: [{ $ref: '#/components/schemas/ObjectId' }], nullable: true },
      parentTask: { allOf: [{ $ref: '#/components/schemas/ObjectId' }], nullable: true },
      assignedTo: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/ObjectId' },
            hourlyRate: { type: 'number', nullable: true, example: 85 }
          }
        }
      },
      storyPoints: { type: 'number', nullable: true, example: 3 },
      dueDate: { type: 'string', format: 'date', nullable: true, example: '2026-05-01' },
      estimatedHours: { type: 'number', nullable: true, example: 6 },
      labels: { type: 'array', nullable: true, items: { type: 'string' }, example: ['auth', 'bug'] },
      subtasks: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', example: 'Reproduce on staging' },
            description: { type: 'string', nullable: true },
            status: { type: 'string', nullable: true, example: 'todo' },
            isCompleted: { type: 'boolean', nullable: true, example: false }
          },
          required: ['title']
        }
      },
      attachments: { type: 'array', nullable: true, items: { type: 'object', additionalProperties: true } },
      isBillable: { type: 'boolean', nullable: true, example: true }
    },
    required: ['title', 'project']
  }

  const TaskUpdateRequest = {
    allOf: [
      { $ref: '#/components/schemas/TaskCreateRequest' },
      {
        type: 'object',
        description: 'Task update payload. Most fields are optional; server applies validation rules.'
      }
    ]
  }

  const ProjectCreateRequest = {
    type: 'object',
    properties: {
      name: { type: 'string', example: 'Website Revamp' },
      description: { type: 'string', nullable: true },
      status: { type: 'string', enum: ['draft', 'planning', 'active', 'on_hold', 'completed', 'cancelled'], nullable: true },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], nullable: true },
      startDate: { type: 'string', format: 'date', example: '2026-04-01' },
      endDate: { type: 'string', format: 'date', nullable: true },
      teamMembers: { type: 'array', nullable: true, items: { $ref: '#/components/schemas/ObjectId' } },
      tags: { type: 'array', nullable: true, items: { type: 'string' } },
      settings: { type: 'object', nullable: true, additionalProperties: true }
    },
    required: ['name', 'startDate']
  }

  const ProjectUpdateRequest = {
    allOf: [
      { $ref: '#/components/schemas/ProjectCreateRequest' },
      { type: 'object', description: 'Project update payload. Most fields are optional.' }
    ]
  }

  const StoryCreateRequest = {
    type: 'object',
    properties: {
      title: { type: 'string', example: 'As a user, I can reset my password' },
      description: { type: 'string', nullable: true },
      acceptanceCriteria: { type: 'array', nullable: true, items: { type: 'string' } },
      project: { $ref: '#/components/schemas/ObjectId' },
      epic: { allOf: [{ $ref: '#/components/schemas/ObjectId' }], nullable: true },
      assignedTo: { allOf: [{ $ref: '#/components/schemas/ObjectId' }], nullable: true },
      status: { type: 'string', nullable: true },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], nullable: true },
      storyPoints: { type: 'number', nullable: true },
      dueDate: { type: 'string', format: 'date', nullable: true },
      estimatedHours: { type: 'number', nullable: true },
      tags: { type: 'array', nullable: true, items: { type: 'string' } }
    },
    required: ['title', 'project']
  }

  const StoryUpdateRequest = {
    allOf: [
      { $ref: '#/components/schemas/StoryCreateRequest' },
      { type: 'object', description: 'Story update payload. Most fields are optional.' }
    ]
  }

  const EpicCreateRequest = {
    type: 'object',
    properties: {
      title: { type: 'string', example: 'Authentication Improvements' },
      description: { type: 'string', nullable: true },
      project: { $ref: '#/components/schemas/ObjectId' },
      assignedTo: { allOf: [{ $ref: '#/components/schemas/ObjectId' }], nullable: true },
      status: { type: 'string', nullable: true },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], nullable: true },
      storyPoints: { type: 'number', nullable: true },
      dueDate: { type: 'string', format: 'date', nullable: true },
      estimatedHours: { type: 'number', nullable: true },
      tags: { type: 'array', nullable: true, items: { type: 'string' } }
    },
    required: ['title', 'project']
  }

  const EpicUpdateRequest = {
    allOf: [
      { $ref: '#/components/schemas/EpicCreateRequest' },
      { type: 'object', description: 'Epic update payload. Most fields are optional.' }
    ]
  }

  const SprintCreateRequest = {
    type: 'object',
    properties: {
      name: { type: 'string', example: 'Sprint 12' },
      description: { type: 'string', nullable: true },
      project: { $ref: '#/components/schemas/ObjectId' },
      startDate: { type: 'string', format: 'date', example: '2026-04-15' },
      endDate: { type: 'string', format: 'date', example: '2026-04-29' },
      goal: { type: 'string', nullable: true },
      capacity: { type: 'number', example: 240 },
      teamMembers: { type: 'array', nullable: true, items: { $ref: '#/components/schemas/ObjectId' } }
    },
    required: ['name', 'project', 'startDate', 'endDate', 'capacity']
  }

  const SprintUpdateRequest = {
    allOf: [
      { $ref: '#/components/schemas/SprintCreateRequest' },
      { type: 'object', description: 'Sprint update payload. Most fields are optional.' }
    ]
  }

  return {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Use a JWT access token. The app also supports cookie-based auth (accessToken/refreshToken).'
      },
      cronSecret: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'CRON_SECRET',
        description: 'Cron endpoints may be protected by a shared secret (Authorization: Bearer <secret>).'
      }
    },
    schemas: {
      ObjectId,
      DateTime,
      ApiSuccess,
      ApiError,
      AuthLoginRequest,
      TaskCreateRequest,
      TaskUpdateRequest,
      ProjectCreateRequest,
      ProjectUpdateRequest,
      StoryCreateRequest,
      StoryUpdateRequest,
      EpicCreateRequest,
      EpicUpdateRequest,
      SprintCreateRequest,
      SprintUpdateRequest,
      User,
      Project,
      Task,
      Story,
      Epic,
      Sprint,
      Notification,
      CustomRole,
      BudgetEntry,
      Currency,
      TimeEntry
    }
  }
}

function requestSchemaRefForRoute(apiPath, method) {
  if (apiPath === '/api/auth/login' && method === 'POST') return '#/components/schemas/AuthLoginRequest'
  if (apiPath === '/api/tasks' && method === 'POST') return '#/components/schemas/TaskCreateRequest'
  if (apiPath === '/api/tasks/{id}' && method === 'PUT') return '#/components/schemas/TaskUpdateRequest'
  if (apiPath === '/api/projects' && method === 'POST') return '#/components/schemas/ProjectCreateRequest'
  if (apiPath === '/api/projects/{id}' && method === 'PUT') return '#/components/schemas/ProjectUpdateRequest'
  if (apiPath === '/api/stories' && method === 'POST') return '#/components/schemas/StoryCreateRequest'
  if (apiPath === '/api/stories/{id}' && method === 'PUT') return '#/components/schemas/StoryUpdateRequest'
  if (apiPath === '/api/epics' && method === 'POST') return '#/components/schemas/EpicCreateRequest'
  if (apiPath === '/api/epics/{id}' && method === 'PUT') return '#/components/schemas/EpicUpdateRequest'
  if (apiPath === '/api/sprints' && method === 'POST') return '#/components/schemas/SprintCreateRequest'
  if (apiPath === '/api/sprints/{id}' && method === 'PUT') return '#/components/schemas/SprintUpdateRequest'
  return null
}

function buildOpenApiSpec(routes) {
  const tags = new Map()

  const paths = {}
  for (const route of routes) {
    const { apiPath, methods, sourceText, filePath } = route
    const tag = guessTagFromPath(apiPath)
    tags.set(tag, { name: tag })

    if (!paths[apiPath]) paths[apiPath] = {}

    const queryParams = extractQueryParams(sourceText)
    const bodyKeys = extractBodyKeys(sourceText)
    const usesFormData = /\.formData\(\)/.test(sourceText)

    const hasPathParams = /\{[^}]+\}/.test(apiPath)
    const resourceRef = resourceRefForPath(apiPath)

    for (const method of methods) {
      const lower = method.toLowerCase()

      const parameters = []

      // path params
      for (const m of apiPath.matchAll(/\{([^}]+)\}/g)) {
        parameters.push({
          name: m[1],
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Path parameter'
        })
      }

      // query params
      for (const qp of queryParams) {
        parameters.push({
          name: qp,
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'Query parameter'
        })
      }

      let requestBody
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        if (usesFormData) {
          requestBody = {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        } else {
          const knownRef = requestSchemaRefForRoute(apiPath, method)
          const props = {}
          const example = {}
          for (const k of bodyKeys) {
            props[k] = { type: 'string' }
            example[k] = `example_${k}`
          }

          requestBody = {
            required: true,
            content: {
              'application/json': {
                schema: knownRef
                  ? { $ref: knownRef }
                  : bodyKeys.length
                    ? { type: 'object', properties: props }
                    : { type: 'object', additionalProperties: true },
                example: bodyKeys.length ? example : undefined
              }
            }
          }
        }
      }

      // Success response shape
      let dataSchema = null

      if (resourceRef) {
        const isList = method === 'GET' && !hasPathParams
        dataSchema = isList ? { type: 'array', items: { $ref: resourceRef } } : { $ref: resourceRef }

        // Some sub-routes are list-y even with params (e.g., /tasks/{id}/comments)
        if (method === 'GET' && /\/(comments|attachments|activities|versions|team|tasks|history)\b/.test(apiPath)) {
          dataSchema = { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      }

      const okSchema = buildSuccessEnvelopeSchema(dataSchema)

      const responses = {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: okSchema,
              examples: {
                success: {
                  value: resourceRef
                    ? { success: true, data: hasPathParams ? { _id: '65f2c3b1b7c2dd4387c2f733' } : [] }
                    : { success: true, data: {} }
                }
              }
            }
          }
        },
        ...buildErrorResponses()
      }

      if (method === 'DELETE') {
        responses[200] = {
          description: 'Deleted',
          content: {
            'application/json': {
              schema: buildSuccessEnvelopeSchema({
                type: 'object',
                properties: { message: { type: 'string', example: 'Deleted' } }
              }),
              examples: {
                deleted: { value: { success: true, data: { message: 'Deleted' } } }
              }
            }
          }
        }
      }

      const operation = {
        tags: [tag],
        operationId: `${lower}_${apiPath.replace(/\W+/g, '_').replace(/^_+|_+$/g, '')}`,
        summary: `${method} ${apiPath}`,
        description: `Source: ${path.relative(repoRoot, filePath).replace(/\\/g, '/')}`,
        security: guessSecurity(apiPath),
        parameters: parameters.length ? parameters : undefined,
        requestBody,
        responses
      }

      paths[apiPath][lower] = operation
    }
  }

  const components = buildComponents()

  return {
    openapi: '3.0.3',
    info: {
      title: 'Kanvaro API',
      version: '1.0.0',
      description:
        'Generated from Next.js route handlers under src/app/api. Authentication is primarily cookie-based, but bearer JWT is supported for API testing.'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local dev' },
      { url: 'https://your-kanvaro-domain.example', description: 'Production (replace)' }
    ],
    tags: [...tags.values()].sort((a, b) => a.name.localeCompare(b.name)),
    paths,
    components
  }
}

function buildPostmanCollection(routes) {
  const variables = [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'authToken', value: '', type: 'string' },
    { key: 'cronSecret', value: '', type: 'string' }
  ]

  const folders = new Map()

  function exampleBodyForRoute(apiPath, method) {
    if (apiPath === '/api/auth/login' && method === 'POST') {
      return { email: 'ava@kanvaro.local', password: 'P@ssw0rd!' }
    }
    if (apiPath === '/api/tasks' && method === 'POST') {
      return {
        title: 'Fix login redirect loop',
        project: '65f2c3b1b7c2dd4387c2f733',
        description: 'Investigate redirect behavior when refresh token expires',
        priority: 'high',
        type: 'bug',
        labels: ['auth', 'bug']
      }
    }
    if (apiPath === '/api/tasks/{id}' && method === 'PUT') {
      return {
        title: 'Fix login redirect loop (updated)',
        status: 'in_progress'
      }
    }
    if (apiPath === '/api/projects' && method === 'POST') {
      return {
        name: 'Website Revamp',
        startDate: '2026-04-01',
        priority: 'high',
        tags: ['frontend', 'q2']
      }
    }
    if (apiPath === '/api/projects/{id}' && method === 'PUT') {
      return { status: 'active' }
    }
    if (apiPath === '/api/stories' && method === 'POST') {
      return {
        title: 'As a user, I can reset my password',
        project: '65f2c3b1b7c2dd4387c2f733',
        acceptanceCriteria: ['Reset link works', 'Password updated successfully'],
        priority: 'medium'
      }
    }
    if (apiPath === '/api/stories/{id}' && method === 'PUT') {
      return { status: 'todo' }
    }
    if (apiPath === '/api/epics' && method === 'POST') {
      return {
        title: 'Authentication Improvements',
        project: '65f2c3b1b7c2dd4387c2f733',
        priority: 'high'
      }
    }
    if (apiPath === '/api/epics/{id}' && method === 'PUT') {
      return { status: 'inprogress' }
    }
    if (apiPath === '/api/sprints' && method === 'POST') {
      return {
        name: 'Sprint 12',
        project: '65f2c3b1b7c2dd4387c2f733',
        startDate: '2026-04-15',
        endDate: '2026-04-29',
        capacity: 240
      }
    }
    if (apiPath === '/api/sprints/{id}' && method === 'PUT') {
      return { goal: 'Stabilize auth flows and improve reporting' }
    }
    return null
  }

  for (const route of routes) {
    const { apiPath, methods, sourceText } = route
    const tag = guessTagFromPath(apiPath)
    if (!folders.has(tag)) folders.set(tag, [])

    const queryParams = extractQueryParams(sourceText)
    const bodyKeys = extractBodyKeys(sourceText)
    const usesFormData = /\.formData\(\)/.test(sourceText)

    for (const method of methods) {
      const urlPath = apiPath
        .replace(/^\/api/, '/api')
        .replace(/\{([^}]+)\}/g, ':$1')

      const headers = []
      const security = guessSecurity(apiPath)
      const needsBearer = security.some((s) => Object.prototype.hasOwnProperty.call(s, 'bearerAuth'))
      const needsCron = security.some((s) => Object.prototype.hasOwnProperty.call(s, 'cronSecret'))

      if (needsBearer) headers.push({ key: 'Authorization', value: 'Bearer {{authToken}}' })
      if (needsCron) headers.push({ key: 'Authorization', value: 'Bearer {{cronSecret}}' })

      let body
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        if (usesFormData) {
          body = {
            mode: 'formdata',
            formdata: [{ key: 'file', type: 'file', src: '' }]
          }
        } else {
          headers.push({ key: 'Content-Type', value: 'application/json' })
          const json = {}
          for (const k of bodyKeys) json[k] = `example_${k}`
          const example = exampleBodyForRoute(apiPath, method)
          body = {
            mode: 'raw',
            raw: JSON.stringify(bodyKeys.length ? json : (example ?? {}), null, 2),
            options: { raw: { language: 'json' } }
          }
        }
      }

      const query = queryParams.map((qp) => ({ key: qp, value: '', disabled: true }))

      folders.get(tag).push({
        name: `${method} ${apiPath}`,
        request: {
          method,
          header: headers,
          url: {
            raw: `{{baseUrl}}${urlPath}`,
            host: ['{{baseUrl}}'],
            path: urlPath.split('/').filter(Boolean),
            query: query.length ? query : undefined
          },
          body
        },
        response: []
      })
    }
  }

  return {
    info: {
      name: 'Kanvaro API',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [...folders.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([folderName, items]) => ({ name: folderName, item: items })),
    variable: variables
  }
}

function main() {
  if (!fs.existsSync(apiRoot)) {
    console.error(`API root not found: ${apiRoot}`)
    process.exit(1)
  }

  const routeFiles = []
  walkForRouteFiles(apiRoot, routeFiles)

  const routes = routeFiles
    .map((filePath) => {
      const sourceText = fs.readFileSync(filePath, 'utf8')
      const apiPath = filePathToApiPath(filePath)
      const methods = extractMethods(sourceText)
      return { filePath, apiPath, methods, sourceText }
    })
    .filter((r) => r.methods.length > 0)
    .sort((a, b) => (a.apiPath + a.methods.join(',')).localeCompare(b.apiPath + b.methods.join(',')))

  const openapi = buildOpenApiSpec(routes)
  const postman = buildPostmanCollection(routes)

  ensureDir(path.dirname(outOpenApiPath))
  ensureDir(path.dirname(outPostmanPath))

  fs.writeFileSync(outOpenApiPath, JSON.stringify(openapi, null, 2) + '\n', 'utf8')
  fs.writeFileSync(outPostmanPath, JSON.stringify(postman, null, 2) + '\n', 'utf8')

  console.log(`Wrote OpenAPI spec: ${path.relative(repoRoot, outOpenApiPath)}`)
  console.log(`Wrote Postman collection: ${path.relative(repoRoot, outPostmanPath)}`)
  console.log(`Routes discovered: ${routes.length}`)
}

main()
