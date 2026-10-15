// Dental arch geometry and per-tooth placement (FDI numbering).
// World frame (mm): +x patient's left (viewer's right), +y up, +z anterior. Occlusal plane ≈ y = 0.

import { TOOTH_TYPES } from './teeth.js';
import { clamp, rng } from '../core/math.js';

// Half arches (patient's right side, x < 0), through crown centres / incisal edges.
const ARCH_CTRL = {
  L: [[0, 21.6], [-5.6, 20.4], [-10.6, 17.5], [-14.9, 12.9], [-18.0, 7.2], [-20.3, 0.9], [-22.2, -7.5], [-23.5, -17.5], [-24.4, -27.5], [-25.0, -37]],
  U: [[0, 25.2], [-6.7, 23.9], [-12.5, 20.3], [-17.1, 14.6], [-20.4, 8.1], [-22.9, 1.2], [-24.8, -7.8], [-26.0, -18.0], [-26.7, -28.2], [-27.1, -38]],
};

export const HINGE = { y: 24, z: -66 }; // transverse axis through the condyles

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

// Dense polyline of a half arch with arc length parametrisation.
export function makeHalfArch(ctrl, extend = 0) {
  const pts = ctrl.map((p) => p.slice());
  if (extend > 0) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    pts.push([b[0] + (dx / l) * extend, b[1] + (dz / l) * extend]);
  }
  const ext = [[-pts[1][0], pts[1][1]], ...pts, [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
  const dense = [];
  for (let i = 1; i < ext.length - 2; i++) {
    for (let k = 0; k < 24; k++) dense.push(catmull(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / 24));
  }
  dense.push(pts[pts.length - 1]);
  const s = [0];
  for (let i = 1; i < dense.length; i++) s.push(s[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  return { pts: dense, s, length: s[s.length - 1] };
}

// Point + frame at arc length s on a half arch (right side). side = -1 right, +1 left (mirrored).
export function archFrame(arch, s, side) {
  const { pts, s: S } = arch;
  s = clamp(s, 0, arch.length);
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (S[m] <= s) lo = m;
    else hi = m;
  }
  const t = (s - S[lo]) / (S[hi] - S[lo] || 1);
  const x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t;
  const z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
  let tx = pts[hi][0] - pts[lo][0], tz = pts[hi][1] - pts[lo][1];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  // right side: outward normal = (tz, -tx)
  let nx = tz, nz = -tx;
  if (side > 0) return { x: -x, z, tx: -tx, tz, nx: -nx, nz };
  return { x, z, tx, tz, nx, nz };
}

// Curve of Spee as a function of anteroposterior position.
export function speeY(z) {
  const t = clamp((22 - z) / 52, 0, 1);
  return -1.5 * Math.sin(Math.PI * Math.pow(t, 0.85));
}

// torque (crown towards buccal, deg), tip (crown towards mesial, deg), occlusal offset (mm)
const INCL = {
  U: { 1: [24, 5, -1.35], 2: [20, 8, -0.9], 3: [8, 10, -0.7], 4: [4, 5, -0.55], 5: [4, 4, -0.55], 6: [7, 3, -0.6], 7: [10, 0, -0.5], 8: [12, -3, -0.4] },
  L: { 1: [13, 2, 1.25], 2: [11, 2, 1.25], 3: [5, 5, 0.9], 4: [-6, 2, 0.6], 5: [-9, 2, 0.6], 6: [-14, 2, 0.55], 7: [-18, 0, 0.5], 8: [-20, -2, 0.4] },
};

export const QUADRANTS = [1, 2, 3, 4];
export const quadJaw = (q) => (q <= 2 ? 'U' : 'L');
export const quadSide = (q) => (q === 1 || q === 4 ? -1 : 1); // patient's right is x < 0

export function allFdi() {
  const list = [];
  for (const q of QUADRANTS) for (let p = 1; p <= 8; p++) list.push(q * 10 + p);
  return list;
}

const deg = Math.PI / 180;

/**
 * overrides: { [fdi]: { tiltM: deg (crown to mesial), tiltB: deg (crown to buccal), shift: [x,y,z] local mm, spin: deg } }
 */
export function computeLayout(overrides = {}) {
  const arches = { U: makeHalfArch(ARCH_CTRL.U), L: makeHalfArch(ARCH_CTRL.L) };
  const teeth = {};
  for (const q of QUADRANTS) {
    const jaw = quadJaw(q), side = quadSide(q);
    const arch = arches[jaw];
    let s = 0.05;
    for (let p = 1; p <= 8; p++) {
      const fdi = q * 10 + p;
      const def = TOOTH_TYPES[jaw + p];
      const w = def.MD * (p >= 6 ? 0.985 : 1);
      const sc = s + w / 2;
      s += w + 0.08;
      const f = archFrame(arch, sc, side);
      const [torque, tip, occOff] = INCL[jaw][p];
      const r = rng(fdi * 977);
      const spin = (r() - 0.5) * 5 * deg;
      const ov = overrides[fdi] || {};

      // base frame: X distal tangent, Y occlusal, Z buccal
      let X = [f.tx, 0, f.tz];
      let Y = [0, jaw === 'L' ? 1 : -1, 0];
      let Z = [f.nx, 0, f.nz];
      // spin around the long axis (small natural rotation)
      [X, Z] = rotPair(X, Z, spin);
      // torque about X: crown towards buccal
      [Y, Z] = rotPair(Y, Z, torque * deg);
      // tip about Z: crown towards mesial (-X)
      [Y, X] = rotPair(Y, X, -tip * deg);

      const yTip = speeY(f.z) + occOff;
      const P = [f.x, yTip, f.z];
      let O = [P[0] - Y[0] * def.H, P[1] - Y[1] * def.H, P[2] - Y[2] * def.H];
      if (ov.tiltM || ov.tiltB || ov.spin || ov.shift) {
        // rotate about a pivot in the apical third of the root, then shift (local mm)
        const py = ov.pivot ?? -0.45 * def.L;
        const piv = [O[0] + Y[0] * py, O[1] + Y[1] * py, O[2] + Y[2] * py];
        [X, Z] = rotPair(X, Z, (ov.spin || 0) * deg);
        [Y, Z] = rotPair(Y, Z, (ov.tiltB || 0) * deg);
        [Y, X] = rotPair(Y, X, -(ov.tiltM || 0) * deg);
        O = [piv[0] - Y[0] * py, piv[1] - Y[1] * py, piv[2] - Y[2] * py];
        if (ov.shift) {
          for (let k = 0; k < 3; k++) O[k] += X[k] * ov.shift[0] + Y[k] * ov.shift[1] + Z[k] * ov.shift[2];
        }
      }
      teeth[fdi] = makeToothFrame(fdi, q, p, jaw, side, def, sc, X, Y, Z, O);
    }
  }
  return { arches, teeth };
}

// rotate the pair (a, b) by angle t: a' = a cos + b sin, b' = b cos - a sin
function rotPair(a, b, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [
    [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s],
    [b[0] * c - a[0] * s, b[1] * c - a[1] * s, b[2] * c - a[2] * s],
  ];
}

function makeToothFrame(fdi, q, p, jaw, side, def, s, X, Y, Z, O) {
  // column-major 4x4 (three.js Matrix4 layout)
  const matrix = [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, O[0], O[1], O[2], 1];
  const toLocal = (x, y, z, out) => {
    const dx = x - O[0], dy = y - O[1], dz = z - O[2];
    out[0] = dx * X[0] + dy * X[1] + dz * X[2];
    out[1] = dx * Y[0] + dy * Y[1] + dz * Y[2];
    out[2] = dx * Z[0] + dy * Z[1] + dz * Z[2];
    return out;
  };
  const toWorld = (x, y, z) => [
    O[0] + X[0] * x + Y[0] * y + Z[0] * z,
    O[1] + X[1] * x + Y[1] * y + Z[1] * z,
    O[2] + X[2] * x + Y[2] * y + Z[2] * z,
  ];
  return { fdi, q, p, jaw, side, def, code: def.code, s, X, Y, Z, O, matrix, toLocal, toWorld };
}

// Adjacent pairs within a jaw ordered along the arch (right distal → left distal).
export function jawSequence(layout, jaw) {
  const qa = jaw === 'U' ? 1 : 4, qb = jaw === 'U' ? 2 : 3;
  const seq = [];
  for (let p = 8; p >= 1; p--) seq.push(layout.teeth[qa * 10 + p]);
  for (let p = 1; p <= 8; p++) seq.push(layout.teeth[qb * 10 + p]);
  return seq;
}

export function toothLabel(fdi) {
  const q = Math.floor(fdi / 10), p = fdi % 10;
  const jaw = q <= 2 ? 'верхней' : 'нижней';
  const side = q === 1 || q === 4 ? 'справа' : 'слева';
  const names = {
    1: 'Центральный резец', 2: 'Боковой резец', 3: 'Клык', 4: 'Первый премоляр', 5: 'Второй премоляр',
    6: 'Первый моляр', 7: 'Второй моляр', 8: 'Зуб мудрости',
  };
  return { title: `${names[p]} ${jaw} челюсти ${side}`, short: names[p] };
}
