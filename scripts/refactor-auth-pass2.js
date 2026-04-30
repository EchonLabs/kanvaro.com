/**
 * Final pass: Replace remaining fetch('/api/auth/me') patterns.
 * 
 * These files have fetch inside function bodies where they read user.id/user.role etc.
 * Strategy: Replace the fetch+json block with reading from a function parameter or
 * the user variable that's already in scope from useAuthContext().
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

function processFile(relPath) {
  const fullPath = path.join(srcDir, relPath);
  let content = fs.readFileSync(fullPath, 'utf-8');
  let changed = false;

  // ========================
  // PATTERN A: Inside useEffect — fetches user for local state
  // Example (calendar, epics, stories, sprints, etc.):
  //   const response = await fetch('/api/auth/me')
  //   if (response.ok) {
  //     const userData = await response.json()
  //     setCurrentUser(userData)
  //   }
  // Replace: remove the fetch block and use `user` from context directly.
  // These components already have useAuthContext imported from pass 1.
  // ========================
  
  // Pattern: 3-5 line blocks
  const patterns = [
    // Pattern: const response = await fetch('/api/auth/me') \n if (response.ok) { const X = ... \n setY(X) ... }
    /(\s*)const (?:response|res) = await fetch\('\/api\/auth\/me'\)\s*\n\s*if \((?:response|res)\.ok\) \{\s*\n\s*const (\w+) = await (?:response|res)\.json\(\)\s*\n\s*(set\w+)\(\2\)\s*\n\s*\}/g,
    
    // Pattern with 'else' after ok check (roles page etc)
    /(\s*)const (?:response|res) = await fetch\('\/api\/auth\/me'\)\s*\n\s*if \((?:response|res)\.ok\) \{\s*\n\s*const (\w+) = await (?:response|res)\.json\(\)\s*\n([\s\S]*?)\n\s*\}(?:\s*else\s*\{[\s\S]*?\})?/g,
    
    // Direct pattern: const response = await fetch('/api/auth/me'); const data = await response.json()
    /(\s*)const (?:response|res) = await fetch\('\/api\/auth\/me'\)\s*\n\s*const (\w+) = await (?:response|res)\.json\(\)/g,
    
    // With .then: const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => null)
    /const (\w+) = await fetch\('\/api\/auth\/me'\)\.then\(\w+ => \w+\.json\(\)\)\.catch\(\(\) => null\)/g,
  ];

  // Simple replacement: for each pattern, replace with a comment
  // Pattern 1: setUser pattern
  content = content.replace(
    /(\s*)const (response|res) = await fetch\('\/api\/auth\/me'\)\s*\n\s*if \(\2\.ok\) \{\s*\n\s*const (\w+) = await \2\.json\(\)\s*\n\s*(set\w+)\(\3\)\s*\n\s*\}/g,
    '$1// User data is now provided by AuthContext (useAuthContext hook)'
  );

  // Pattern: fetch with .then().catch() inline
  content = content.replace(
    /const (\w+) = await fetch\('\/api\/auth\/me'\)\.then\(\w+ => \w+\.json\(\)\)\.catch\(\(\) => null\)/g,
    'const $1 = user // User from AuthContext'
  );
  
  // Pattern: response = await fetch ... if ok ... const data = ... 
  // followed by specific usage like _data.id or _data.role
  // Replace: const response = await fetch('/api/auth/me')
  content = content.replace(
    /(\s*)const (response|res) = await fetch\('\/api\/auth\/me'\)\s*\n(\s*)if \(\2\.ok\) \{\s*\n(\s*)const (\w+) = await \2\.json\(\)/g,
    '$1// User data available from AuthContext\n$3if (user) {\n$4const $5 = user'
  );
  
  // Simple remaining: just const res = await fetch('/api/auth/me') + const data = await res.json()
  content = content.replace(
    /(\s*)const (response|res) = await fetch\('\/api\/auth\/me'\)\s*\n(\s*)const (\w+) = await \2\.json\(\)/g,
    '$1// User data from AuthContext\n$3const $4 = user'
  );

  // Handle edge case: bare fetch('/api/auth/me') that wasn't caught
  content = content.replace(
    /(\s*)(?:const )?(?:response|res) = await fetch\('\/api\/auth\/me'\)/g,
    '$1// User available from useAuthContext (no fetch needed)'
  );
  
  if (content !== fs.readFileSync(fullPath, 'utf-8')) {
    changed = true;
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`MODIFIED: ${relPath}`);
  } else {
    console.log(`UNCHANGED: ${relPath}`);
  }
  
  return changed;
}

const files = [
  'app/calendar/page.tsx',
  'app/epics/page.tsx',
  'app/epics/[id]/page.tsx',
  'app/projects/create/page.tsx',
  'app/sprints/page.tsx',
  'app/stories/page.tsx',
  'app/stories/[id]/page.tsx',
  'app/tasks/[id]/edit/page.tsx',
  'app/team/roles/page.tsx',
  'components/projects/AddExpenseDialog.tsx',
  'components/settings/UserSettings.tsx',
  'components/tasks/CreateTaskModal.tsx',
];

console.log('=== Pass 2: Remaining auth fetch replacements ===\n');
let count = 0;
for (const f of files) {
  if (processFile(f)) count++;
}
console.log(`\nModified: ${count}/${files.length}`);

// Final check
console.log('\n=== Final scan ===');
const remaining = [];
for (const f of files) {
  const fullPath = path.join(srcDir, f);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const matches = (content.match(/fetch\('\/api\/auth\/me'\)/g) || []).length;
  if (matches > 0) {
    remaining.push(`  ${f} (${matches} calls)`);
  }
}
if (remaining.length === 0) {
  console.log('All fetch calls replaced successfully!');
} else {
  console.log('Still remaining:');
  remaining.forEach(r => console.log(r));
}
