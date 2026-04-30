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

const files = findFiles(srcDir);
console.log('Files still containing fetch(/api/auth/me):');
files.forEach(f => {
  const count = (f.content.match(/fetch\('\/api\/auth\/me'\)/g) || []).length;
  const hasImport = f.content.includes('useAuthContext');
  console.log(`  ${f.relPath} (${count} calls, hasImport=${hasImport})`);
});
console.log(`\nTotal: ${files.length} files`);
