import { setSkills } from './skills.ts';

/* ================= skill data: the files, in the browser =================
   Every data/skills/<id>.json, bundled by Vite and handed to the registry. On the dev server a change to any of
   them (a save from the skill editor, or an edit by hand) re-runs this module in every open page, so the tactical
   view and the unit data page pick up the new numbers without a reload. */
const files = import.meta.glob('../../data/skills/*.json', { eager: true, import: 'default' });
setSkills(Object.values(files));

if (import.meta.hot) import.meta.hot.accept();
