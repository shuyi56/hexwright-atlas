/* ================= app state ================= */
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), wrap = $('mapWrap'), tip = $('tip'), veil = $('veil');
const coarse = matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 700;
const S = coarse ? 1.55 : 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const table = getComputedStyle(document.documentElement).getPropertyValue('--table').trim() || '#121819';

/** Mutable view/app state shared across the UI modules. */
export const state = {
  map: null,
  baseImg: null,
  cw: 0,
  ch: 0,
  dpr: 1,
  z: 1,
  ox: 0,
  oy: 0,
  fitZ: 1,
  hover: -1,
  sel: -1,
  showLabels: true,
  showNums: false,
  showGrid: true,
  labels: [],
  dirty: false,
  anim: 0,
};

export { $, S, canvas, coarse, ctx, reduceMotion, table, tip, veil, wrap };
