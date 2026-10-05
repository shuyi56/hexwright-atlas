/* ================= geometry ================= */
const COLS = 48, ROWS = 34, R = 26, M = 64, SQ3 = Math.sqrt(3), HW = SQ3 * R, TAU = Math.PI * 2;
const worldW = Math.round(M * 2 + R * 2 + 1.5 * R * (COLS - 1));
const worldH = Math.round(M * 2 + HW * ROWS + HW / 2);
const N = COLS * ROWS;
const CX = new Float32Array(N), CY = new Float32Array(N), AQ = new Int16Array(N), AR = new Int16Array(N);
const DIRS = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
for (let i = 0; i < N; i++) {
  const c = i % COLS, r = (i / COLS) | 0;
  CX[i] = M + R + 1.5 * R * c;
  CY[i] = M + HW / 2 + HW * r + ((c & 1) ? HW / 2 : 0);
  AQ[i] = c; AR[i] = r - ((c - (c & 1)) >> 1);
}
const NB = [];
for (let i = 0; i < N; i++) {
  const a = [];
  for (const [dq, dr] of DIRS) {
    const q = AQ[i] + dq, ar = AR[i] + dr;
    if (q < 0 || q >= COLS) { a.push(-1); continue; }
    const row = ar + ((q - (q & 1)) >> 1);
    a.push(row < 0 || row >= ROWS ? -1 : row * COLS + q);
  }
  NB.push(a);
}
const hexDist = (a, b) => { const dq = AQ[a] - AQ[b], dr = AR[a] - AR[b]; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
function hexAt(x, y) {
  const px = x - (M + R), py = y - (M + HW / 2);
  const q = (2 / 3 * px) / R, a = (-1 / 3 * px + SQ3 / 3 * py) / R, s = -q - a;
  let rx = Math.round(q), rz = Math.round(a), ry = Math.round(s);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - a), dy = Math.abs(ry - s);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
  if (rx < 0 || rx >= COLS) return -1;
  const r = rz + ((rx - (rx & 1)) >> 1);
  return r < 0 || r >= ROWS ? -1 : r * COLS + rx;
}
const COS = [], SIN = [];
for (let k = 0; k <= 6; k++) { COS.push(Math.cos(Math.PI / 3 * k)); SIN.push(Math.sin(Math.PI / 3 * k)); }
function hexPath(g, x, y, rad) { g.moveTo(x + rad, y); for (let k = 1; k < 6; k++) g.lineTo(x + rad * COS[k], y + rad * SIN[k]); g.closePath(); }
const hexNo = i => String(i % COLS + 1).padStart(2, '0') + String(((i / COLS) | 0) + 1).padStart(2, '0');

export { COLS, COS, CX, CY, HW, M, N, NB, R, ROWS, SIN, SQ3, TAU, hexAt, hexDist, hexNo, hexPath, worldH, worldW };
