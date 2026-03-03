#!/usr/bin/env node
/**
 * seed-tenant.js
 *
 * Verifies and seeds a new tenant database with required collections, indexes,
 * and optional default data.
 *
 * Usage:
 *   node scripts/seed-tenant.js                  # seed ALL configured orgs
 *   node scripts/seed-tenant.js <orgId>          # seed a specific org
 *   node scripts/seed-tenant.js --verify         # verify only, don't create anything
 *
 * This script:
 * 1. Connects to each tenant DB via config.json
 * 2. Ensures all model collections + indexes exist
 * 3. Optionally creates a default "Super Admin" CustomRole with all permissions
 * 4. Reports the state of each tenant DB
 */

const path = require('path')
const fs = require('fs')
const mongoose = require('mongoose')

// ── Load config.json ────────────────────────────────────────────────────────
const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ config.json not found. Run the setup wizard first.')
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
}

// ── All permission values (mirrors Permission enum) ─────────────────────────
// Keep in sync with src/lib/permissions/permission-definitions.ts
const ALL_PERMISSIONS = [
  'system:admin', 'system:monitor', 'system:maintenance',
  'user:create', 'user:read', 'user:update', 'user:delete',
  'user:invite', 'user:activate', 'user:deactivate', 'user:manage_roles',
  'organization:read', 'organization:update', 'organization:delete',
  'organization:manage_settings', 'organization:manage_billing',
  'project:create', 'project:read', 'project:update', 'project:delete',
  'project:manage_team', 'project:manage_budget', 'project:archive',
  'project:restore', 'project:view_all',
  'task:create', 'task:read', 'task:update', 'task:delete',
  'task:assign', 'task:change_status', 'task:manage_priority',
  'task:bulk_update',
  'team:read', 'team:manage', 'team:invite',
  'time_tracking:create', 'time_tracking:read', 'time_tracking:read_all',
  'time_tracking:update', 'time_tracking:delete', 'time_tracking:approve',
  'time_tracking:manage_settings', 'time_tracking:export',
  'financial:read', 'financial:manage_budget', 'financial:approve_expenses',
  'financial:view_all', 'financial:export',
  'reporting:view_basic', 'reporting:view_advanced', 'reporting:export',
  'reporting:view_all', 'reporting:manage',
  'settings:read', 'settings:update', 'settings:manage_integrations',
  'epic:create', 'epic:read', 'epic:update', 'epic:delete',
  'sprint:create', 'sprint:read', 'sprint:update', 'sprint:delete',
  'sprint:start', 'sprint:complete', 'sprint:manage',
  'story:create', 'story:read', 'story:update', 'story:delete',
  'calendar:read', 'calendar:manage',
  'kanban:read', 'kanban:manage',
  'backlog:read', 'backlog:manage',
  'test_management:create_test_case', 'test_management:read_test_case',
  'test_management:update_test_case', 'test_management:delete_test_case',
  'test_management:create_test_plan', 'test_management:read_test_plan',
  'test_management:update_test_plan', 'test_management:delete_test_plan',
  'test_management:execute_tests', 'test_management:manage_test_suites',
  'test_management:view_reports',
  'documentation:read', 'documentation:create', 'documentation:update',
  'documentation:delete', 'documentation:manage',
]

// ── Model names that should exist as collections ────────────────────────────
const EXPECTED_MODELS = [
  'User', 'Organization', 'Project', 'Task', 'Sprint', 'Story', 'Epic',
  'CustomRole', 'Currency', 'TimeEntry', 'ActiveTimer', 'TimeTrackingSettings',
  'Notification', 'SprintEvent', 'Counter', 'BudgetEntry', 'BurnRate',
  'Expense', 'UserInvitation',
]

async function connectToOrg(orgConfig) {
  const { uri, database } = orgConfig.database
  const opts = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  }
  const conn = await mongoose.createConnection(uri, opts).asPromise()
  // Ensure we're on the right DB
  return conn.useDb(database, { useCache: true })
}

async function verifyOrg(orgConfig, verifyOnly = false) {
  const orgLabel = `${orgConfig.name} (${orgConfig.id})`
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`🏢 Org: ${orgLabel}`)
  console.log(`   DB:  ${orgConfig.database.database}`)
  console.log(`${'═'.repeat(60)}`)

  let conn
  try {
    conn = await connectToOrg(orgConfig)
    console.log(`✅ Connected to database "${conn.name}"`)
  } catch (err) {
    console.error(`❌ Failed to connect: ${err.message}`)
    return false
  }

  // ── List existing collections ───────────────────────────────────────────
  const collections = await conn.db.listCollections().toArray()
  const collectionNames = new Set(collections.map(c => c.name))
  console.log(`\n   📦 Existing collections (${collectionNames.size}):`)
  for (const name of [...collectionNames].sort()) {
    console.log(`      - ${name}`)
  }

  // ── Check for key documents ─────────────────────────────────────────────
  const orgCount = await conn.db.collection('organizations').countDocuments().catch(() => 0)
  const userCount = await conn.db.collection('users').countDocuments().catch(() => 0)
  const currencyCount = await conn.db.collection('currencies').countDocuments().catch(() => 0)
  const roleCount = await conn.db.collection('customroles').countDocuments().catch(() => 0)

  console.log('\n   📊 Document counts:')
  console.log(`      Organizations: ${orgCount}`)
  console.log(`      Users:         ${userCount}`)
  console.log(`      Currencies:    ${currencyCount}`)
  console.log(`      CustomRoles:   ${roleCount}`)

  if (verifyOnly) {
    if (orgCount === 0) console.warn('   ⚠️  No Organization document found!')
    if (userCount === 0) console.warn('   ⚠️  No User documents found!')
    if (currencyCount === 0) console.warn('   ⚠️  No currencies seeded!')
    await conn.close()
    return true
  }

  // ── Seed: Create "Super Admin" CustomRole if none exists ────────────────
  if (roleCount === 0 && orgCount > 0) {
    console.log('\n   🌱 Creating default "Super Admin" CustomRole...')
    const org = await conn.db.collection('organizations').findOne({})
    const admin = await conn.db.collection('users').findOne({ role: 'admin' })

    if (org && admin) {
      await conn.db.collection('customroles').insertOne({
        name: 'Super Admin',
        description: 'Default role with all permissions. Created by seed script.',
        permissions: ALL_PERMISSIONS,
        organization: org._id,
        createdBy: admin._id,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      console.log('   ✅ "Super Admin" CustomRole created')
    } else {
      console.warn('   ⚠️  Cannot create CustomRole: missing Organization or Admin user')
    }
  }

  // ── Ensure indexes ──────────────────────────────────────────────────────
  console.log('\n   🔑 Ensuring indexes...')
  const indexOps = [
    { coll: 'users', idx: { email: 1 }, opts: { unique: true } },
    { coll: 'users', idx: { organization: 1, isActive: 1 }, opts: {} },
    { coll: 'organizations', idx: { name: 1 }, opts: { unique: true } },
    { coll: 'customroles', idx: { organization: 1, name: 1 }, opts: { unique: true } },
    { coll: 'customroles', idx: { organization: 1, isActive: 1 }, opts: {} },
    { coll: 'projects', idx: { organization: 1 }, opts: {} },
    { coll: 'tasks', idx: { project: 1, status: 1 }, opts: {} },
    { coll: 'tasks', idx: { assignee: 1, status: 1 }, opts: {} },
    { coll: 'currencies', idx: { code: 1 }, opts: { unique: true } },
  ]

  for (const { coll, idx, opts } of indexOps) {
    try {
      await conn.db.collection(coll).createIndex(idx, opts)
    } catch (err) {
      // Index may already exist with different options, skip
      if (!err.message.includes('already exists')) {
        console.warn(`   ⚠️  Index on ${coll}: ${err.message}`)
      }
    }
  }
  console.log('   ✅ Indexes ensured')

  await conn.close()
  console.log(`\n   ✅ Org "${orgConfig.name}" is ready`)
  return true
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const verifyOnly = args.includes('--verify')
  const orgId = args.find(a => !a.startsWith('--'))

  const config = loadConfig()
  const orgs = config.organizations || []

  if (orgs.length === 0) {
    console.error('❌ No organizations configured in config.json')
    process.exit(1)
  }

  const targets = orgId ? orgs.filter(o => o.id === orgId) : orgs

  if (targets.length === 0) {
    console.error(`❌ No org found with id "${orgId}"`)
    console.log('Available orgs:', orgs.map(o => `${o.name} (${o.id})`).join(', '))
    process.exit(1)
  }

  console.log(`\n🚀 ${verifyOnly ? 'Verifying' : 'Seeding'} ${targets.length} tenant database(s)...\n`)

  let success = true
  for (const org of targets) {
    const ok = await verifyOrg(org, verifyOnly)
    if (!ok) success = false
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(success ? '✅ All done!' : '⚠️  Some orgs had issues. Check logs above.')
  console.log(`${'═'.repeat(60)}\n`)

  process.exit(success ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
