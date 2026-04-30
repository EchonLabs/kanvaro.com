/**
 * Comprehensive cleanup: Add `const { user } = useAuthContext()` to components
 * that reference `user` but don't destructure it from the context yet.
 * Also clean up residual broken code from batch refactoring.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

const SKIP = [
    'app/api/', 'lib/auth-utils.ts', 'hooks/useAuth.ts', 'contexts/AuthContext.tsx',
    'app/sign-in/', 'app/login/',
    'components/layout/Header.tsx', 'components/layout/MainLayout.tsx',
    'components/providers/DateTimeProvider.tsx',
    'app/dashboard/page.tsx', 'app/kanban/page.tsx',
    'app/time-tracking/page.tsx', // already manually fixed
];

function findFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (['node_modules', '.next', '.git', 'scripts'].includes(entry.name)) continue;
        if (entry.isDirectory()) {
            results.push(...findFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
            const relPath = path.relative(srcDir, fullPath).replace(/\\/g, '/');
            if (SKIP.some(s => relPath.startsWith(s))) continue;
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

    // Normalize line endings for processing
    const hadCRLF = content.includes('\r\n');
    if (hadCRLF) content = content.replace(/\r\n/g, '\n');

    const hasAuthImport = content.includes("import { useAuthContext } from '@/contexts/AuthContext'");
    if (!hasAuthImport) {
        // Restore and skip
        if (hadCRLF) content = content.replace(/\n/g, '\r\n');
        continue;
    }

    // Check if useAuthContext() is already called/destructured in the component
    const hasDestructuring = /const \{[^}]*\} = useAuthContext\(\)/.test(content);

    // If the file uses `user` variable but doesn't have destructuring, add it
    // We need to find the component function and add destructuring inside it
    if (!hasDestructuring) {
        // Find where to insert: after the first line inside the component function that has hooks
        // Common patterns: const router = useRouter() or const [state, setState] = useState(...)
        // Insert after first const/let/var line inside the export default function

        // Find "export default function XXX() {" and insert after it
        const funcMatch = content.match(/export default function \w+\([^)]*\)\s*\{/)
        if (funcMatch) {
            const funcIdx = content.indexOf(funcMatch[0]) + funcMatch[0].length;
            // Find a good insertion point - after the first few useState/useRouter lines
            const afterFunc = content.substring(funcIdx);

            // Find the first hook call (useState, useRouter, etc.)
            const hookMatch = afterFunc.match(/\n(\s*)(const |let )/)
            if (hookMatch) {
                const indent = hookMatch[1];
                const insertPos = funcIdx + afterFunc.indexOf(hookMatch[0]) + hookMatch[0].length;
                // Insert before the first const/let
                const insertLine = `${indent}const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()\n`;
                content = content.substring(0, funcIdx) + '\n' + insertLine + content.substring(funcIdx);
            }
        } else {
            // For non-default exports or named components, try a different approach
            const namedFuncMatch = content.match(/(?:export )?(?:const|function) \w+\s*(?::\s*React\.FC[^=]*)?=?\s*(?:function|(?:\([^)]*\))?\s*=>)\s*\{/)
            if (namedFuncMatch) {
                const idx = content.indexOf(namedFuncMatch[0]) + namedFuncMatch[0].length;
                const afterFunc = content.substring(idx);
                const hookMatch = afterFunc.match(/\n(\s*)(const |let )/)
                if (hookMatch) {
                    const indent = hookMatch[1];
                    const insertLine = `\n${indent}const { user } = useAuthContext()`;
                    content = content.substring(0, idx) + insertLine + content.substring(idx);
                }
            }
        }
    }

    // CLEANUP 1: Remove broken fetchAndSetCurrentUser functions that reference undefined `user` and `response`
    // These were left behind from the batch script's incomplete fetch replacement
    content = content.replace(
        /\n\s*const fetchAndSetCurrentUser = useCallback\(async \(\) => \{[\s\S]*?\}, \[\]\)/g,
        ''
    );

    // CLEANUP 2: Remove broken checkAuth functions that reference fetchAndSetCurrentUser
    content = content.replace(
        /\n\s*const checkAuth = useCallback\(async \(\) => \{[\s\S]*?\}, \[router(?:, fetchAndSetCurrentUser)?\]\)/g,
        ''
    );

    // CLEANUP 3: Remove useEffect(() => { checkAuth() }, [checkAuth])
    content = content.replace(
        /\n\s*useEffect\(\(\) => \{\s*\n\s*checkAuth\(\)\s*\n\s*\}, \[checkAuth\]\)/g,
        ''
    );

    // CLEANUP 4: Remove broken response checks from second pass replacement
    // Pattern: "if (response.ok) {" or "return response" where response is undefined
    // These are inside broken function bodies - remove them
    content = content.replace(
        /\n\s*return response\s*\n/g,
        '\n'
    );

    // CLEANUP 5: Remove authError references where state was removed
    if (!content.includes('setAuthError') && !content.includes("useState('')")) {
        // authError is no longer defined - remove references
        content = content.replace(/\n\s*if \(authError\) \{\s*\n\s*return \(\s*\n[\s\S]*?Redirecting to login[\s\S]*?\n\s*\)\s*\n\s*\}/g, '');
        // Also references like: if (!loading && !authError) {
        content = content.replace(/\s*&& !authError/g, '');
        content = content.replace(/\s*\|\| authError/g, '');
    }

    // CLEANUP 6: Remove checkAuth from useEffect dependency arrays
    content = content.replace(/, checkAuth/g, '');

    // CLEANUP 7: Remove broken if(user) blocks from second pass that reference .catch()
    // Pattern: if (user) { const data = user.catch(() => ({})) ... }
    content = content.replace(
        /\n\s*\/\/ User data available from AuthContext\s*\n\s*if \(user\) \{\s*\n\s*const \w+ = user\.catch\(\(\) => \(\{\}\)\)\s*\n[\s\S]*?\n\s*\}/g,
        ''
    );

    // CLEANUP 8: Remove broken variable refs "const X = user" from failed fetch replacement  
    // Pattern from pass2: "// User data from AuthContext\n    const data = user"
    // followed by code that uses data.catch or data.ok which doesn't make sense
    // Leave the ones that are just simple assignments

    // CLEANUP 9: Clean up multiple blank lines
    content = content.replace(/\n{4,}/g, '\n\n\n');

    // Restore CRLF
    if (hadCRLF) content = content.replace(/\n/g, '\r\n');

    if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf-8');
        console.log(`FIXED: ${relPath}`);
        fixedCount++;
    }
}

console.log(`\nFixed ${fixedCount} files.`);
