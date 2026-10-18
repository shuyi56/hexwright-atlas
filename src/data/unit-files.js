import './class-files.js';
import { setUnits } from './units.ts';

/* ================= NPC data: the files, in the browser =================
   Every data/npcs/<group>/<id>.json, bundled by Vite and handed to the unit registry, after the classes they name
   (class-files.js). On the dev server an edit to any of them re-runs this module in every open page, so the
   tactical view picks up the change without a reload. */
const files = import.meta.glob('../../data/npcs/*/*.json', { eager: true, import: 'default' });
setUnits(Object.entries(files).map(([path, unit]) => ({ group: path.split('/').slice(-2)[0], unit })));

if (import.meta.hot) import.meta.hot.accept();
