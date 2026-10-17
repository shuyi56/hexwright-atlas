import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ID_RE, normalizeSkill, skillPath, skillText, validateSkill } from '../src/data/skills.ts';
import { ROOT } from './units-store.mjs';

/* ================= skill data: the files, on disk =================
   Reads and writes data/skills/<id>.json for Node: the dev server's bridge (tools/vite-hexwright.js), which the skill
   editor saves through, and the tests. Every write is normalized (src/data/skills.ts), so the files stay in one
   canonical shape however they were edited. */
function readSkills(root = ROOT) {
  const dir = join(root, 'data/skills'); if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { file: skillPath(f.slice(0, -5)), raw, skill: normalizeSkill(raw) };
  });
}
/* write one skill; returns { skill, file } or throws with the reasons it was refused */
function writeSkill(raw, root = ROOT) {
  const errs = validateSkill(raw); if (errs.length) throw new Error(errs.join('; '));
  const skill = normalizeSkill(raw), file = skillPath(skill.id), abs = join(root, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, skillText(skill));
  return { skill, file };
}
/* delete one skill's file; returns whether there was one */
function deleteSkill(id, root = ROOT) {
  if (!ID_RE.test(id)) throw new Error('no such skill');
  const abs = join(root, skillPath(id)); if (!existsSync(abs)) return false;
  rmSync(abs); return true;
}

export { deleteSkill, readSkills, writeSkill };
