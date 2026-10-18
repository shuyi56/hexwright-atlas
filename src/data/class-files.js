import { setClasses } from './classes.ts';

/* ================= class data: the files, in the browser =================
   Every data/classes/<id>.json, bundled by Vite and handed to the registry. On the dev server a change to any of
   them (a save from the class editor, or an edit by hand) re-runs this module in every open page, so the tactical
   view and the unit page pick up the new numbers without a reload. */
const files = import.meta.glob('../../data/classes/*.json', { eager: true, import: 'default' });
setClasses(Object.values(files));

if (import.meta.hot) import.meta.hot.accept();
