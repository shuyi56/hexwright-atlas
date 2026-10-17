import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ID_RE, classPath, classText, normalizeClass, validateClass } from '../src/data/classes.ts';
import { ROOT } from './npcs-store.mjs';

/* ================= class data: the files, on disk =================
   Reads and writes data/classes/<id>.json for Node: the dev server's bridge (tools/vite-hexwright.js), which the
   class editor saves through, and the tests. Every write is normalized (src/data/classes.ts), so the files stay in
   one canonical shape however they were edited. */
function readClasses(root = ROOT) {
  const dir = join(root, 'data/classes'); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { file: classPath(f.slice(0, -5)), raw, cls: normalizeClass(raw) };
  });
}
/* write one class; returns { cls, file } or throws with the reasons it was refused */
function writeClass(raw, root = ROOT) {
  const errs = validateClass(raw); if (errs.length) throw new Error(errs.join('; '));
  const cls = normalizeClass(raw), file = classPath(cls.id), abs = join(root, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, classText(cls));
  return { cls, file };
}
/* delete one class's file; returns whether there was one */
function deleteClass(id, root = ROOT) {
  if (!ID_RE.test(id)) throw new Error('no such class');
  const abs = join(root, classPath(id)); if (!existsSync(abs)) return false;
  rmSync(abs); return true;
}

export { deleteClass, readClasses, writeClass };
