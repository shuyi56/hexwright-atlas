import { setUnits } from './units.js';

/* ================= unit data: the files, in the browser =================
   Every data/units/<group>/<id>.json, bundled by Vite and handed to the registry. On the dev server a change to
   any of them (a save from the unit data page, or an edit by hand) re-runs this module in every open page, so the
   tactical view picks up new numbers without a reload. */
const files = import.meta.glob('../../data/units/*/*.json', { eager: true, import: 'default' });
setUnits(Object.entries(files).map(([path, unit]) => ({ group: path.split('/').slice(-2)[0], unit })));

if (import.meta.hot) import.meta.hot.accept();
