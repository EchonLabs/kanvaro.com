// Creates (or removes) one test user per Kanvaro role in a LOCAL/TEST database.
// For MCP tasks 0.5 and 0.7. Never run against production.
//
//   node mcp-server/tools/seed-test-users.cjs            create/update users
//   node mcp-server/tools/seed-test-users.cjs --remove   delete them again
//
// Env: MONGODB_URI (default mongodb://localhost:27017/kanvaro2)
// Credentials are written to mcp-server/tools/.test-users.json (git-ignored).
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const root = path.resolve(__dirname, '..', '..')
const mongoose = require(require.resolve('mongoose', { paths: [root] }))
const bcrypt = require(require.resolve('bcryptjs', { paths: [root] }))

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kanvaro2'
const OUT = path.join(__dirname, '.test-users.json')
const ROLES = ['admin', 'human_resource', 'project_manager', 'team_member', 'client', 'viewer', 'qa_engineer', 'tester', 'custom']
// 'custom' is a team member who gets the custom role in seed-test-data.mjs
const kanvaroRole = name => (name === 'custom' ? 'team_member' : name)
const emailFor = role => `mcp-test-${role.replace(/_/g, '-')}@kanvaro.test`

async function main() {
  if (!/localhost|127\.0\.0\.1/.test(URI) && !process.env.ALLOW_NON_LOCAL) {
    throw new Error('Refusing: MONGODB_URI is not local. Set ALLOW_NON_LOCAL=1 for a test server.')
  }
  await mongoose.connect(URI)
  const users = mongoose.connection.db.collection('users')
  const orgs = mongoose.connection.db.collection('organizations')

  if (process.argv.includes('--remove')) {
    const r = await users.deleteMany({ email: { $in: ROLES.map(emailFor) } })
    console.log(`removed ${r.deletedCount} test users`)
    if (fs.existsSync(OUT)) fs.unlinkSync(OUT)
    return
  }

  const org = await orgs.findOne({})
  if (!org) throw new Error('No organisation found — complete Kanvaro setup first')

  const creds = { createdAt: new Date().toISOString(), database: URI.replace(/\/\/[^@]*@/, '//***@'), users: {} }
  for (const role of ROLES) {
    const email = emailFor(role)
    const password = crypto.randomBytes(12).toString('base64url')
    const hash = await bcrypt.hash(password, 12) // same cost as Kanvaro
    const now = new Date()
    await users.updateOne(
      { email },
      {
        $set: { password: hash, role: kanvaroRole(role), organization: org._id, isActive: true, emailVerified: true, updatedAt: now },
        $setOnInsert: {
          firstName: 'MCP Test', lastName: role.replace(/_/g, ' '), email,
          timezone: 'UTC', language: 'en', currency: 'USD', twoFactorEnabled: false,
          projectRoles: [], createdAt: now,
        },
      },
      { upsert: true }
    )
    const u = await users.findOne({ email }, { projection: { _id: 1 } })
    creds.users[role] = { id: u._id.toString(), email, password }
  }
  creds.organization = org._id.toString()
  fs.writeFileSync(OUT, JSON.stringify(creds, null, 2), { mode: 0o600 })
  console.log(`created/updated ${ROLES.length} test users in org ${org._id}; credentials → ${path.relative(root, OUT)}`)
}

main().catch(e => { console.error(e.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
