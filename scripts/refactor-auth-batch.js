const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const SKIP = [
  'components/layout/Header.tsx',
  'components/layout/MainLayout.tsx',
  'components/providers/DateTimeProvider.tsx',
  'app/dashboard/page.tsx',
  'app/kanban/page.tsx',
  'hooks/useAuth.ts',
  'contexts/AuthContext.tsx',
  'app/api/',
  'lib/auth-utils.ts',
  'app/sign-in/page.tsx', // login pages handle auth differently
  'app/login/page.tsx',
];

function findFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes("fetch('/api/auth/me')")) {
        const relPath = path.relative(srcDir, fullPath).replace(/\\/g, '/');
        const skip = SKIP.some(s => relPath.startsWith(s));
        if (!skip) {
          results.push({ fullPath, relPath, content });
        }
      }
    }
  }
  return results;
}

function addImport(content) {
  if (content.includes("useAuthContext")) return content;
  
  // Find the last import line
  const lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('import ')) {
      lastImportIdx = i;
    }
    // Stop once we've passed the import section
    if (lastImportIdx > -1 && !lines[i].trimStart().startsWith('import ') && lines[i].trim() !== '' && !lines[i].trim().startsWith('}') && !lines[i].trim().startsWith('//')) {
      break;
    }
  }
  
  if (lastImportIdx > -1) {
    lines.splice(lastImportIdx + 1, 0, "import { useAuthContext } from '@/contexts/AuthContext'");
    return lines.join('\n');
  }
  return content;
}

function replaceAuthPatterns(content, relPath) {
  let modified = false;
  
  // PATTERN 1: Full checkAuth callback with fetch + refresh + redirect
  // Common in: tasks/page, backlog/page, sprints/page, etc.
  const fullCheckAuthCB = /\s*const checkAuth = useCallback\(async \(\) => \{[\s\S]*?fetch\('\/api\/auth\/me'\)[\s\S]*?\}, \[[^\]]*\]\)\s*\n\s*useEffect\(\(\) => \{\s*\n?\s*checkAuth\(\)\s*\n?\s*\}, \[checkAuth\]\)/g;
  
  if (fullCheckAuthCB.test(content)) {
    content = content.replace(fullCheckAuthCB, '');
    modified = true;
  }
  
  // PATTERN 2: Inline useEffect with async auth check
  // e.g. useEffect(() => { async function checkAuth() { const res = await fetch('/api/auth/me')... }; checkAuth() }, [])
  const inlineCheckAuth = /\s*useEffect\(\(\) => \{\s*(?:let \w+ = true\s*\n?\s*)?(?:const \w+ = )?async (?:function \w+\(\)|\(\) =>)\s*\{[\s\S]*?fetch\('\/api\/auth\/me'\)[\s\S]*?\}\s*;?\s*\n?\s*(?:\w+)\(\)\s*(?:\n\s*return \(\) => \{[^}]*\})?;?\s*\n?\s*\}, \[[^\]]*\]\)/g;
  
  if (inlineCheckAuth.test(content)) {
    content = content.replace(inlineCheckAuth, '');
    modified = true;
  }
  
  // PATTERN 3: Simple fetch in useEffect for user data
  // e.g. const response = await fetch('/api/auth/me') ... setUser(userData) ...
  // For pages that use user data (not just auth check)
  const userFetchInEffect = /\s*useEffect\(\(\) => \{\s*(?:const \w+ = )?async (?:function \w+\(\)|\(\) =>)\s*\{[\s\S]*?const (?:response|res) = await fetch\('\/api\/auth\/me'\)[\s\S]*?set\w+\([\s\S]*?\}\s*;?\s*\n?\s*(?:\w+)\(\)\s*\n?\s*\}, \[[^\]]*\]\)/g;
  
  // PATTERN 4: Direct fetch in callback that sets user (not in useEffect)
  // const loadUser = ... fetch('/api/auth/me') ... setCurrentUser()
  // This is more complex and file-specific, skip for now
  
  // PATTERN 5: Standalone fetch('/api/auth/me') inside try blocks for getting user ID
  // These need different treatment - replace with context user
  
  // For now, let's handle the variables. Many pages have:
  // const [checkingAuth, setCheckingAuth] = useState(true)
  // const [authError, setAuthError] = useState('')
  // These can be cleaned up too.
  
  // Remove auth-related state that's no longer needed
  content = content.replace(/\s*const \[checkingAuth, setCheckingAuth\] = useState\(true\)\s*\n/g, '\n');
  content = content.replace(/\s*const \[authError, setAuthError\] = useState\(''\)\s*\n/g, '\n');
  
  // Remove auth error display blocks
  content = content.replace(/\s*useEffect\(\(\) => \{\s*\n?\s*if \(authError\) \{[\s\S]*?\}, \[authError\]\)/g, '');
  
  // Remove checkingAuth loading blocks  
  content = content.replace(/\s*if \(checkingAuth\) \{\s*\n?\s*return \([\s\S]*?Checking session\.\.\.[\s\S]*?\)\s*\n?\s*\}/g, '');
  
  // Remove authError display blocks
  content = content.replace(/\s*if \(authError\) \{\s*\n?\s*return \([\s\S]*?Redirecting to login\.\.\.[\s\S]*?\)\s*\n?\s*\}/g, '');
  
  if (modified) {
    // Also clean up unused imports
    if (!content.includes('useCallback') || (content.match(/useCallback/g) || []).length <= 1) {
      // Check if useCallback is used elsewhere
      const ucCount = (content.match(/useCallback/g) || []).length;
      if (ucCount === 1) {
        // Only in import, remove it
        content = content.replace(/, useCallback/g, '');
        content = content.replace(/useCallback, /g, '');
      }
    }
  }
  
  return { content, modified };
}

// Now let's also handle pages that fetch user data (not just auth check)
// These need a different approach: add const { user } = useAuthContext() and use it
function replaceUserFetch(content, relPath) {
  let modified = false;
  
  // Find patterns like: const response = await fetch('/api/auth/me')
  // followed by: const userData = await response.json()
  // followed by: setUser(userData) or similar
  
  // For component-level effects that load user, replace with auth context
  // Pattern: useEffect with fetch('/api/auth/me') that sets local state
  
  // Simple inline patterns: const response = await fetch('/api/auth/me')
  // if (response.ok) { const userData = await response.json(); ... }
  // Replace with: const { user } = useAuthContext() (already have user from context)
  
  // We handle this one remaining fetch pattern:
  // Inside a function body (not a useEffect) where user ID is needed
  const standaloneUserFetch = /const (?:response|res) = await fetch\('\/api\/auth\/me'\)\s*\n\s*(?:if \((?:response|res)\.ok\) \{\s*\n\s*)?const (?:\w+) = await (?:response|res)\.json\(\)/g;
  
  // Don't auto-replace these - they need manual context since they're inside
  // complex functions that use the result differently
  
  return { content, modified };
}

console.log('=== Batch Auth Refactor ===\n');

const files = findFiles(srcDir);
let refactored = 0;

for (const file of files) {
  let content = file.content;
  let anyModified = false;
  
  // Step 1: Add import
  const withImport = addImport(content);
  if (withImport !== content) {
    content = withImport;
    anyModified = true;
  }
  
  // Step 2: Replace auth patterns
  const { content: replaced, modified } = replaceAuthPatterns(content, file.relPath);
  if (modified) {
    content = replaced;
    anyModified = true;
  }
  
  if (anyModified) {
    fs.writeFileSync(file.fullPath, content, 'utf-8');
    console.log(`MODIFIED: ${file.relPath}`);
    refactored++;
  } else {
    console.log(`NO AUTO-MATCH: ${file.relPath}`);
  }
}

console.log(`\nRefactored ${refactored} files.`);

// Re-scan
console.log('\n=== Remaining files with fetch(/api/auth/me) ===');
const remaining = findFiles(srcDir);
remaining.forEach(f => {
  const count = (f.content.match(/fetch\('\/api\/auth\/me'\)/g) || []).length;
  console.log(`  ${f.relPath} (${count} calls)`);
});
console.log(`Total remaining: ${remaining.length}`);
