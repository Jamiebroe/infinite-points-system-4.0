// Development helper: verify every module parses and imports cleanly under Node.
//   node scripts/check-modules.mjs
// The pure engine and the UI layer are both import-safe outside a browser
// (no module touches `document` or `SillyTavern` at import time).
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const targets = ['src', 'src/catalog', 'src/ui', 'src/ui/tabs'];

async function filesIn(dir) {
    const out = [];
    let entries;
    try { entries = await readdir(join(root, dir), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.js')) out.push(join(root, dir, e.name));
    }
    return out;
}

let failed = 0;
let checked = 0;
const all = [];
for (const dir of targets) all.push(...await filesIn(dir));

for (const file of all.sort()) {
    checked++;
    try {
        await import(pathToFileURL(file).href);
    } catch (e) {
        failed++;
        console.error(`FAIL  ${relative(root, file)}\n      ${e.message}`);
    }
}

console.log(`${checked - failed}/${checked} modules imported successfully.`);
if (failed) {
    console.error(`${failed} module(s) failed.`);
    process.exit(1);
}
