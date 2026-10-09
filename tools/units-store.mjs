import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, ID_RE, normalizeUnit, unitPath, unitText, validateUnit } from '../src/data/units.js';

/* ================= unit data: the files, on disk =================
   Reads and writes data/units/<group>/<id>.json for Node: the dev server's bridge (tools/vite-hexwright.js), which
   the unit data page saves through, and the tests. Every write is normalized (src/data/units.js), so the files
   stay in one canonical shape however they were edited. A unit lives in exactly one group: saving it under one
   removes it from the other. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readUnits(root = ROOT) {
  const out = [];
  for (const group of GROUPS) {
    const dir = join(root, 'data/units', group); if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      out.push({ group, file: unitPath(group, f.slice(0, -5)), raw, unit: normalizeUnit(raw, group) });
    }
  }
  return out;
}
/* write one unit; returns { unit, file } or throws with the reasons it was refused */
function writeUnit(group, raw, root = ROOT) {
  const errs = validateUnit(raw, group); if (errs.length) throw new Error(errs.join('; '));
  const unit = normalizeUnit(raw, group), file = unitPath(group, unit.id), abs = join(root, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, unitText(unit, group));
  for (const g of GROUPS) if (g !== group) rmSync(join(root, unitPath(g, unit.id)), { force: true });
  return { unit, file };
}
/* delete one unit's file; returns whether there was one */
function deleteUnit(group, id, root = ROOT) {
  if (!GROUPS.includes(group) || !ID_RE.test(id)) throw new Error('no such unit');
  const abs = join(root, unitPath(group, id)); if (!existsSync(abs)) return false;
  rmSync(abs); return true;
}

export { ROOT, deleteUnit, readUnits, writeUnit };
