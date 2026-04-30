/**
 * Targeted fix for remaining 6 files with broken imports.
 * These files still have the pattern:
 *   import { \r\n
 *   import { useAuthContext } from '@/contexts/AuthContext'\r\n
 *     SomeIcon, \r\n
 * 
 * The previous fix script failed on these because the regex
 * was already applied (changed the first occurrence but there was
 * a second one, or the CRLF normalization didn't cover edge cases).
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

const filesToFix = [
    'app/epics/page.tsx',
    'app/epics/[id]/page.tsx',
    'app/stories/page.tsx',
    'app/stories/[id]/page.tsx',
    'app/stories/create-story/page.tsx',
    'app/tasks/[id]/page.tsx',
    'app/tasks/create-new-task/page.tsx',
];

let fixed = 0;

for (const relPath of filesToFix) {
    const fullPath = path.join(srcDir, relPath);
    let content = fs.readFileSync(fullPath, 'utf-8');
    const original = content;

    // Simple string replacement — find the exact broken pattern
    // Pattern: "import { \r\nimport { useAuthContext } from '@/contexts/AuthContext'\r\n"
    // Replace with: "import { useAuthContext } from '@/contexts/AuthContext'\r\nimport { \r\n"

    const broken1 = "import { \r\nimport { useAuthContext } from '@/contexts/AuthContext'\r\n";
    const fix1 = "import { useAuthContext } from '@/contexts/AuthContext'\r\nimport { \r\n";

    if (content.includes(broken1)) {
        content = content.replace(broken1, fix1);
    }

    // Also try without \r
    const broken2 = "import { \nimport { useAuthContext } from '@/contexts/AuthContext'\n";
    const fix2 = "import { useAuthContext } from '@/contexts/AuthContext'\nimport { \n";

    if (content.includes(broken2)) {
        content = content.replace(broken2, fix2);
    }

    if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf-8');
        console.log(`FIXED: ${relPath}`);
        fixed++;
    } else {
        // Debug: show what's around the import
        const idx = content.indexOf("import { useAuthContext }");
        if (idx > -1) {
            const before = content.substring(Math.max(0, idx - 50), idx);
            const after = content.substring(idx, idx + 80);
            console.log(`NOT FIXED (import exists): ${relPath}`);
            console.log(`  Before: ${JSON.stringify(before)}`);
            console.log(`  Match:  ${JSON.stringify(after)}`);
        } else {
            console.log(`NO IMPORT FOUND: ${relPath}`);
        }
    }
}

console.log(`\nFixed: ${fixed}/${filesToFix.length}`);
