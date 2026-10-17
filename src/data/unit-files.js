import './class-files.js';
import { setUnits } from './units.ts';

/* ================= unit data: the files, in the browser =================
   Every data/units/<group>/<id>.json, bundled by Vite and handed to the registry, after the classes they name
   (class-files.js). On the dev server a change to any of them (a save from the unit page, or an edit by hand)
   re-runs this module in every open page, so the tactical view picks up the change without a reload. */
const files = import.meta.glob('../../data/units/*/*.json', { eager: true, import: 'default' });
setUnits(Object.entries(files).map(([path, unit]) => ({ group: path.split('/').slice(-2)[0], unit })));

if (import.meta.hot) import.meta.hot.accept();
