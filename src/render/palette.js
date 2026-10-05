import { TAU } from '../core/geometry.js';

/* ================= painting ================= */
const INK = '#2b2116', VEL = '#f0e6cb', WALL = '#efe3c4', WALL_D = '#d3c199', GOLD = '#c9a24f', GOLD_D = '#a07e34', WAX = '#a83a2c';
const ROOFS = [['#a6533b', '#7c3a2a'], ['#66727e', '#48525c'], ['#bf9850', '#94733a']];
const SHADOW = 'rgba(74,52,26,0.2)';
const MT = { temperate: ['#ecdfc1', '#ad9572'], cold: ['#e6e2d8', '#9b968d'], arid: ['#efd6b0', '#b7865e'], dark: ['#8d8378', '#564c45'] };
const HILLP = { temperate: ['#e2cf98', '#c1a96f'], cold: ['#dddccb', '#afae9b'], arid: ['#ebd29c', '#c9a067'] };
const TREE = { oak: ['#87a05a', '#637d43'], deep: ['#6c8549', '#4c6435'], pine: ['#76a356', '#55803f'], spruce: ['#6b9c5c', '#4b7a46'], poplar: ['#7f9a52', '#5c773f'], birch: ['#a6ba6c', '#7f9650'], bush: ['#93a862', '#6c8447'], autumn1: ['#cf9f48', '#9b7232'], autumn2: ['#bf7240', '#8d4f2b'] };
const STONE = ['#ddd1b0', '#b5a683'];
const lerp = (a, b, t) => a + (b - a) * t;
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbStr = (c, k) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
const climate = (map, i) => { const t = map.temp[i]; return t < 0.22 ? 'cold' : t > 0.7 ? 'arid' : 'temperate'; };

function castShadow(g, x, y, w, h) { g.beginPath(); g.ellipse(x + w * 0.12, y, w / 2, Math.max(1, h / 2), 0, 0, TAU); g.fillStyle = SHADOW; g.fill(); }
function poly(g, pts) { g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); }
function shadeRight(g, pathFn, fromX, col) { g.save(); pathFn(); g.clip(); g.fillStyle = col; g.fillRect(fromX, -1e4, 2e4, 2e4); g.restore(); }

export { GOLD, GOLD_D, HILLP, INK, MT, ROOFS, STONE, TREE, VEL, WALL, WALL_D, WAX, castShadow, climate, hexRgb, lerp, poly, rgbStr, shadeRight };
