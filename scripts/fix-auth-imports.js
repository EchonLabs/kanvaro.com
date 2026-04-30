/**
 * Fix broken imports — handles CRLF line endings properly.
 * The broken pattern is:
 *   import {\r\n
 *   import { useAuthContext } from '@/contexts/AuthContext'\n
 *     ArrowLeft,\r\n
 * 
 * Fix: Move useAuthContext import before the multi-line import block.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

const SKIP_DIRS = ['node_modules', '.next', '.git'];
const SKIP_PATHS = ['app/api/', 'lib/auth-utils.ts', 'hooks/useAuth.ts', 'contexts/AuthContext.tsx'];

function findFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (SKIP_DIRS.includes(entry.name)) continue;
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const relPath = path.relative(srcDir, fullPath).replace(/\\/g, '/');
      if (SKIP_PATHS.some(s => relPath.startsWith(s))) continue;
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

let fixedCount = 0;
const files = findFiles(srcDir);

for (const { fullPath, relPath } of files) {
  let content = fs.readFileSync(fullPath, 'utf-8');
  const original = content;

  // Normalize: temporarily replace \r\n with \n for easier regex, then restore
  const hadCRLF = content.includes('\r\n');
  if (hadCRLF) content = content.replace(/\r\n/g, '\n');

  // FIX: import { useAuthContext } line stuck inside a multi-line import block
  // Pattern: "import {\nimport { useAuthContext }...\n  SomeIcon,"
  const brokenPattern = /import \{\nimport \{ useAuthContext \} from '@\/contexts\/AuthContext'\n/g;
  if (brokenPattern.test(content)) {
    content = content.replace(brokenPattern,
      "import { useAuthContext } from '@/contexts/AuthContext'\nimport {\n");
  }

  // Also fix variant where there's no newline between (shouldn't exist but just in case)
  // And variant where useAuthContext import has a \r at end
  content = content.replace(
    /import \{\nimport \{ useAuthContext \} from '@\/contexts\/AuthContext'\r?\n/g,
    "import { useAuthContext } from '@/contexts/AuthContext'\nimport {\n"
  );

  // Remove leftover periodic auth check intervals that reference deleted checkAuth
  content = content.replace(
    /\n\s*\/\/ Set up periodic auth check to handle token expiration\s*\n\s*useEffect\(\(\) => \{\s*\n\s*const interval = setInterval\(\(\) => \{\s*\n\s*checkAuth\(\)\s*\n\s*\}, \d+ \* \d+ \* \d+\)[^\n]*\n\s*\n\s*return \(\) => clearInterval\(interval\)\s*\n\s*\}, \[checkAuth\]\)/g,
    ''
  );

  // Remove leftover setAuthError('') calls
  content = content.replace(/\s*setAuthError\(''\)/g, '');

  // Remove leftover authError state declarations
  if (!content.includes('setAuthError') && !content.includes('checkAuth')) {
    content = content.replace(/\n\s*const \[authError, setAuthError\] = useState\(''\)\s*\n/g, '\n');
  }

  // Remove leftover authError references in JSX
  if (!content.includes('setAuthError')) {
    content = content.replace(/ \|\| authError/g, '');
    content = content.replace(/authError \|\| /g, '');
  }

  // Remove leftover user state when useAuthContext is available
  if (content.includes('useAuthContext') && !content.includes('setUser(')) {
    content = content.replace(/\n\s*const \[user, setUser\] = useState<any>\(null\)\s*\n/g, '\n');
  }

  // Remove multiple blank lines
  content = content.replace(/\n{4,}/g, '\n\n\n');

  // Restore CRLF if original had it
  if (hadCRLF) content = content.replace(/\n/g, '\r\n');

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    fixedCount++;
    console.log(`FIXED: ${relPath}`);
  }
}

console.log(`\nFixed ${fixedCount} files.`);
