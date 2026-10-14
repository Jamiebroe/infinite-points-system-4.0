// Development helper: report imported names that are never used in a file.
//   node scripts/check-unused-imports.mjs
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function walk(dir, out = []) {
    for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const files = [...await walk('src'), ...await walk('tests'), 'index.js'];
let problems = 0;

for (const file of files) {
    const src = await readFile(join(root, file), 'utf8');
    const body = src.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, '');
    const names = [];
    for (const m of src.matchAll(/^import\s*\{([^}]+)\}\s*from/gm)) {
        for (const raw of m[1].split(',')) {
            const name = raw.trim().split(/\s+as\s+/).pop().trim();
            if (name) names.push(name);
        }
    }
    for (const m of src.matchAll(/^import\s+(\w+)\s+from/gm)) names.push(m[1]);

    const unused = names.filter(n => !new RegExp(`\\b${n.replace(/[$]/g, '\\$')}\\b`).test(body));
    if (unused.length) {
        problems += unused.length;
        console.log(`${file}: unused import(s) → ${unused.join(', ')}`);
    }
}

console.log(problems ? `\n${problems} unused import(s) found.` : 'No unused imports.');
if (problems) process.exit(1);
