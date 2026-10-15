// Parametric tooth anatomy as signed distance functions.
// Canonical tooth frame (mm): +x distal, -x mesial, +y occlusal / incisal, +z buccal / labial.
// Origin: centre of the cemento-enamel junction (CEJ). Dimensions follow Wheeler's averages.

import {
  clamp, mix, smoothstep, smin, smax, segDist2, roundRect, ellipse2, ellipsoid,
  roundCone, noise3, fbm3, makeProfile, culled, sphereBox,
} from '../core/math.js';

export const TOOTH_NAMES = {
  1: 'Центральный резец',
  2: 'Боковой резец',
  3: 'Клык',
  4: 'Первый премоляр',
  5: 'Второй премоляр',
  6: 'Первый моляр',
  7: 'Второй моляр',
  8: 'Третий моляр (зуб мудрости)',
};

// ---------------------------------------------------------------------------
// Key profiles: [y, A (half md), Bb (buccal half), Bl (lingual half)]

function incisorKeys(o) {
  const { H, L, MD, cMD, BL, cBL } = o;
  const a0 = cMD / 2, am = MD / 2, b0 = cBL / 2, bm = BL / 2;
  const ra = o.rootA ?? 0.92;
  return [
    [-L, 0.3, 0.32, 0.32],
    [-0.9 * L, a0 * ra * 0.34, b0 * 0.4, b0 * 0.38],
    [-0.62 * L, a0 * ra * 0.62, b0 * 0.7, b0 * 0.66],
    [-0.3 * L, a0 * ra * 0.85, b0 * 0.9, b0 * 0.86],
    [-0.05 * L, a0 * 0.98, b0 * 0.99, b0 * 0.98],
    [0, a0, b0, b0],
    [0.13 * H, mix(a0, am, 0.42), bm * 1.0, bm * 0.98],
    [0.36 * H, am * 0.955, bm * 0.88, bm * 0.6],
    [0.62 * H, am * 0.995, bm * 0.6, bm * 0.3],
    [0.86 * H, am, bm * 0.36, bm * 0.16],
    [H + 0.6, am * 0.985, 0.45, 0.26],
  ];
}

function canineKeys(o) {
  const { H, L, MD, cMD, BL, cBL } = o;
  const a0 = cMD / 2, am = MD / 2, b0 = cBL / 2, bm = BL / 2;
  return [
    [-L, 0.36, 0.38, 0.38],
    [-0.88 * L, a0 * 0.38, b0 * 0.42, b0 * 0.4],
    [-0.6 * L, a0 * 0.68, b0 * 0.72, b0 * 0.66],
    [-0.28 * L, a0 * 0.9, b0 * 0.93, b0 * 0.88],
    [-0.05 * L, a0 * 0.99, b0, b0 * 0.99],
    [0, a0, b0, b0],
    [0.18 * H, mix(a0, am, 0.5), bm * 1.0, bm * 0.98],
    [0.45 * H, am, bm * 0.93, bm * 0.8],
    [0.7 * H, am * 0.94, bm * 0.74, bm * 0.56],
    [H + 1.0, am * 0.55, bm * 0.38, bm * 0.26],
  ];
}

function premolarKeys(o) {
  const { H, L, MD, cMD, BL, cBL } = o;
  const a0 = cMD / 2, am = MD / 2, b0 = cBL / 2, bm = BL / 2;
  const crown = [
    [0, a0, b0, b0],
    [0.28 * H, am * 0.96, bm * 1.0, bm * 0.93],
    [0.55 * H, am, bm * 0.96, bm * 1.0],
    [0.8 * H, am * 0.95, bm * 0.86, bm * 0.88],
    [H + 1.2, am * 0.8, bm * 0.6, bm * 0.62],
  ];
  if (o.bifurcation) {
    const yb = -o.bifurcation;
    return [
      [yb - 1.6, a0 * 0.55, b0 * 0.62, b0 * 0.62],
      [yb, a0 * 0.78, b0 * 0.86, b0 * 0.86],
      [-0.4 * o.bifurcation, a0 * 0.92, b0 * 0.96, b0 * 0.95],
      ...crown,
    ];
  }
  return [
    [-L, 0.38, 0.42, 0.42],
    [-0.86 * L, a0 * 0.42, b0 * 0.46, b0 * 0.43],
    [-0.56 * L, a0 * 0.68, b0 * 0.75, b0 * 0.7],
    [-0.25 * L, a0 * 0.88, b0 * 0.93, b0 * 0.9],
    ...crown,
  ];
}

function molarKeys(o) {
  const { H, MD, cMD, BL, cBL, trunk } = o;
  const a0 = cMD / 2, am = MD / 2, b0 = cBL / 2, bm = BL / 2;
  return [
    [-trunk - 1.8, a0 * 0.55, b0 * 0.55, b0 * 0.55],
    [-trunk, a0 * 0.86, b0 * 0.85, b0 * 0.85],
    [-trunk * 0.5, a0 * 0.96, b0 * 0.96, b0 * 0.96],
    [0, a0, b0, b0],
    [0.3 * H, am * 0.96, bm * 1.0, bm * 0.95],
    [0.55 * H, am, bm * 0.97, bm * 1.0],
    [0.82 * H, am * 0.94, bm * 0.86, bm * 0.88],
    [H + 1.2, am * 0.8, bm * 0.64, bm * 0.66],
  ];
}

// Cusp / ridge / groove helpers in fractions of (am, bm).
const C = (x, z, dh, extra = {}) => ({ t: 0, x, z, dh, r: 0.9, s: 0.75, ex: 1, ez: 1, ...extra });
const R = (ax, az, bx, bz, dh, extra = {}) => ({ t: 1, ax, az, bx, bz, dh, r: 0.5, s: 0.95, ...extra });
const G = (ax, az, bx, bz, d, w = 0.32) => ({ ax, az, bx, bz, d, w });
const P = (x, z, d, w = 0.45) => ({ x, z, d, w });

// ---------------------------------------------------------------------------
// Type table

function makeTypes() {
  const T = {};

  // ---- Upper ----
  T.U1 = {
    kind: 'incisor', H: 10.5, L: 13, MD: 8.6, cMD: 6.6, BL: 7.0, cBL: 6.2, cejM: 3.2, cejD: 2.4,
    mDrop: 0.45, dDrop: 1.5, fossa: { depth: 0.55, rx: 0.62, ry: 0.27, rz: 1.8 }, enamel: [0.9, 1.4], bend: 0.4,
    round: 0.85, taperL: 0.22,
  };
  T.U2 = {
    kind: 'incisor', H: 9.2, L: 13, MD: 6.6, cMD: 5.0, BL: 6.0, cBL: 5.4, cejM: 2.8, cejD: 2.0,
    mDrop: 0.8, dDrop: 2.1, fossa: { depth: 0.6, rx: 0.6, ry: 0.27, rz: 1.5 }, enamel: [0.85, 1.3], bend: 0.9,
    round: 0.9, taperL: 0.24,
  };
  T.U3 = {
    kind: 'canine', H: 10.2, L: 17, MD: 7.6, cMD: 5.6, BL: 8.1, cBL: 7.2, cejM: 2.4, cejD: 1.5,
    tipX: -0.45, slopeM: 0.6, slopeD: 0.7, ridgeB: 0.32, ridgeL: 0.4, enamel: [1.0, 2.1], bend: 0.8,
    round: 0.95, taperL: 0.18,
  };
  T.U4 = {
    kind: 'premolar', H: 8.4, L: 14, MD: 7.0, cMD: 5.0, BL: 9.1, cBL: 8.1, cejM: 1.0, cejD: 0.6,
    bifurcation: 5.2, enamel: [1.2, 2.0], round: 0.8,
    feats: [
      C(0.04, 0.52, 0, { ex: 0.62, r: 1.0 }), C(0.1, -0.5, -0.9, { ex: 0.75 }),
      R(-0.8, -0.42, -0.8, 0.42, -1.5), R(0.8, -0.42, 0.8, 0.42, -1.65),
    ],
    grooves: [G(-0.62, 0.0, 0.62, 0.0, 0.8)],
    pits: [P(-0.55, 0.0, 0.35), P(0.55, 0.0, 0.3)],
    roots: [
      { pts: [[0, -4.2, 1.8, 1.9], [0.2, -9.5, 2.0, 1.3], [0.35, -13.8, 2.1, 0.45]], sx: 1.3, sz: 1 },
      { pts: [[0, -4.2, -1.8, 1.9], [0.2, -9.5, -2.1, 1.3], [0.35, -13.2, -2.4, 0.45]], sx: 1.3, sz: 1 },
    ],
  };
  T.U5 = {
    kind: 'premolar', H: 8.0, L: 14.2, MD: 6.8, cMD: 4.9, BL: 9.0, cBL: 8.0, cejM: 1.0, cejD: 0.6,
    enamel: [1.2, 2.0], round: 0.8, bend: 0.5,
    feats: [
      C(0.0, 0.5, 0, { ex: 0.62, r: 1.0 }), C(0.05, -0.48, -0.3, { ex: 0.7 }),
      R(-0.8, -0.42, -0.8, 0.42, -1.5), R(0.8, -0.42, 0.8, 0.42, -1.6),
    ],
    grooves: [G(-0.5, 0.0, 0.5, 0.0, 0.7)],
    pits: [P(-0.48, 0.0, 0.3), P(0.48, 0.0, 0.3)],
  };
  T.U6 = {
    kind: 'molar', H: 7.4, MD: 10.3, cMD: 8.0, BL: 11.2, cBL: 10.2, trunk: 4.0, cejM: 0.9, cejD: 0.4,
    enamel: [1.3, 2.3], round: 0.7, skew: -0.1,
    feats: [
      C(-0.46, 0.55, 0), C(0.48, 0.55, -0.35), C(-0.32, -0.5, 0.15, { r: 1.4 }), C(0.6, -0.48, -1.2, { r: 0.8 }),
      R(-0.32, -0.5, 0.48, 0.55, -1.5, { s: 0.9 }),
      R(-0.82, -0.45, -0.82, 0.45, -1.35), R(0.83, -0.4, 0.83, 0.4, -1.7),
    ],
    grooves: [
      G(-0.62, 0.02, -0.05, 0.08, 0.85), G(0.02, 0.1, 0.02, 1.05, 0.7),
      G(0.55, -0.05, 0.36, -0.62, 0.6), G(0.36, -0.62, 0.22, -1.05, 0.55),
    ],
    pits: [P(-0.08, 0.05, 0.4), P(-0.62, 0.0, 0.3), P(0.55, -0.08, 0.3)],
    roots: [
      { pts: [[-2.4, -3.2, 2.4, 2.0], [-2.7, -8, 2.9, 1.5], [-3.1, -12.2, 3.2, 0.5]], sx: 1.35, sz: 1 },
      { pts: [[2.5, -3.2, 2.5, 1.8], [2.9, -8, 2.9, 1.35], [3.4, -11.2, 3.0, 0.5]], sx: 1.2, sz: 1 },
      { pts: [[0.0, -3.2, -2.4, 2.2], [0.2, -8.5, -4.0, 1.7], [0.4, -13.0, -5.0, 0.6]], sx: 1, sz: 1.05 },
    ],
  };
  T.U7 = {
    kind: 'molar', H: 7.0, MD: 9.2, cMD: 7.2, BL: 11.0, cBL: 10.0, trunk: 4.0, cejM: 0.8, cejD: 0.3,
    enamel: [1.3, 2.2], round: 0.72, skew: -0.14,
    feats: [
      C(-0.44, 0.55, 0), C(0.46, 0.52, -0.6), C(-0.3, -0.5, 0.15, { r: 1.4 }), C(0.6, -0.45, -1.9, { r: 0.7 }),
      R(-0.3, -0.5, 0.46, 0.52, -1.6, { s: 0.9 }),
      R(-0.82, -0.45, -0.82, 0.45, -1.4), R(0.84, -0.4, 0.84, 0.4, -1.9),
    ],
    grooves: [G(-0.6, 0.02, -0.05, 0.08, 0.8), G(0.02, 0.1, 0.05, 1.05, 0.6), G(0.5, -0.05, 0.3, -0.6, 0.55)],
    pits: [P(-0.08, 0.05, 0.4), P(-0.6, 0.0, 0.3)],
    roots: [
      { pts: [[-2.2, -3.2, 2.4, 1.9], [-2.4, -8, 2.7, 1.45], [-2.6, -11.6, 2.8, 0.5]], sx: 1.35, sz: 1 },
      { pts: [[2.2, -3.2, 2.4, 1.7], [2.4, -7.8, 2.6, 1.3], [2.4, -10.6, 2.6, 0.5]], sx: 1.2, sz: 1 },
      { pts: [[0.0, -3.2, -2.3, 2.1], [0.2, -8.2, -3.4, 1.6], [0.4, -12.2, -4.0, 0.6]], sx: 1, sz: 1.05 },
    ],
  };
  T.U8 = {
    kind: 'molar', H: 6.5, MD: 8.6, cMD: 6.6, BL: 10.0, cBL: 9.3, trunk: 3.0, cejM: 0.6, cejD: 0.3,
    enamel: [1.2, 2.0], round: 0.85, skew: -0.08, irregular: 0.35,
    feats: [
      C(-0.36, 0.5, 0), C(0.45, 0.42, -0.7), C(-0.12, -0.45, 0.05, { r: 1.4 }),
      R(-0.82, -0.4, -0.82, 0.4, -1.5), R(0.8, -0.3, 0.8, 0.3, -2.0),
    ],
    grooves: [G(-0.55, 0.0, 0.3, 0.0, 0.7), G(0.05, 0.0, 0.05, 1.0, 0.5)],
    pits: [P(0.0, 0.0, 0.4)],
    roots: [{ pts: [[0, -2.4, 0, 3.4], [0.5, -6.5, -0.3, 2.5], [1.3, -10.3, -0.5, 0.9]], sx: 1.15, sz: 0.85 }],
  };

  // ---- Lower ----
  T.L1 = {
    kind: 'incisor', H: 9.0, L: 12.5, MD: 5.3, cMD: 3.6, BL: 5.9, cBL: 5.4, cejM: 3.0, cejD: 2.2,
    mDrop: 0.12, dDrop: 0.3, rootA: 0.84, fossa: { depth: 0.3, rx: 0.6, ry: 0.25, rz: 1.2 }, enamel: [0.8, 1.2],
    round: 0.9, taperL: 0.1,
  };
  T.L2 = {
    kind: 'incisor', H: 9.4, L: 13.8, MD: 5.8, cMD: 4.0, BL: 6.4, cBL: 5.9, cejM: 2.8, cejD: 2.0,
    mDrop: 0.2, dDrop: 0.65, rootA: 0.84, fossa: { depth: 0.3, rx: 0.6, ry: 0.25, rz: 1.2 }, enamel: [0.8, 1.2],
    round: 0.9, taperL: 0.1, bend: 0.4,
  };
  T.L3 = {
    kind: 'canine', H: 11.0, L: 16, MD: 7.0, cMD: 5.4, BL: 7.6, cBL: 7.0, cejM: 2.4, cejD: 1.2,
    tipX: -0.6, slopeM: 0.55, slopeD: 0.68, ridgeB: 0.3, ridgeL: 0.25, enamel: [1.0, 2.0], bend: 0.6,
    round: 0.95, taperL: 0.15,
  };
  T.L4 = {
    kind: 'premolar', H: 8.6, L: 14, MD: 7.0, cMD: 5.0, BL: 7.7, cBL: 6.6, cejM: 1.0, cejD: 0.5,
    enamel: [1.1, 2.0], round: 0.9, bend: 0.3,
    feats: [
      C(0.0, 0.28, 0, { ex: 0.7, r: 1.1 }), C(0.12, -0.62, -2.8, { r: 0.6 }),
      R(0.0, 0.28, 0.12, -0.62, -2.0, { s: 0.9 }),
      R(-0.8, -0.35, -0.8, 0.35, -2.2), R(0.8, -0.35, 0.8, 0.35, -2.4),
    ],
    grooves: [],
    pits: [P(-0.36, -0.22, 0.5), P(0.38, -0.22, 0.5)],
  };
  T.L5 = {
    kind: 'premolar', H: 8.0, L: 14.5, MD: 7.1, cMD: 5.0, BL: 8.2, cBL: 7.0, cejM: 1.0, cejD: 0.5,
    enamel: [1.2, 2.0], round: 0.85, bend: 0.3,
    feats: [
      C(0.0, 0.42, 0, { ex: 0.68, r: 1.0 }), C(-0.38, -0.52, -0.9, { r: 0.8 }), C(0.44, -0.5, -1.4, { r: 0.7 }),
      R(-0.8, -0.4, -0.8, 0.4, -1.6), R(0.8, -0.4, 0.8, 0.4, -1.8),
    ],
    grooves: [G(-0.58, 0.0, 0.58, 0.0, 0.7), G(0.05, 0.0, 0.05, -1.0, 0.5)],
    pits: [P(0.02, -0.05, 0.4)],
  };
  T.L6 = {
    kind: 'molar', H: 7.5, MD: 11.2, cMD: 9.0, BL: 10.4, cBL: 9.0, trunk: 3.0, cejM: 1.0, cejD: 0.4,
    enamel: [1.3, 2.3], round: 0.7,
    feats: [
      C(-0.6, 0.5, -0.15), C(0.0, 0.56, -0.3), C(0.68, 0.32, -0.9, { r: 0.8 }),
      C(-0.52, -0.52, 0.25), C(0.38, -0.52, 0.05),
      R(-0.86, -0.42, -0.86, 0.42, -1.4), R(0.87, -0.38, 0.87, 0.28, -1.7),
    ],
    grooves: [
      G(-0.76, 0.02, 0.78, -0.02, 0.85), G(-0.3, 0.02, -0.3, 1.05, 0.6),
      G(0.36, 0.0, 0.5, 1.0, 0.5), G(-0.08, 0.0, -0.06, -1.05, 0.6),
    ],
    pits: [P(-0.08, 0.0, 0.4), P(-0.7, 0.0, 0.3), P(0.7, 0.0, 0.3)],
    roots: [
      { pts: [[-2.6, -2.6, 0, 1.85], [-2.7, -8, 0, 1.45], [-1.7, -13.6, -0.2, 0.5]], sx: 1, sz: 0.46 },
      { pts: [[2.6, -2.6, 0, 1.75], [2.9, -8, 0, 1.35], [3.3, -12.6, 0, 0.5]], sx: 1, sz: 0.5 },
    ],
  };
  T.L7 = {
    kind: 'molar', H: 7.0, MD: 10.5, cMD: 8.2, BL: 10.0, cBL: 9.0, trunk: 3.0, cejM: 0.9, cejD: 0.4,
    enamel: [1.3, 2.2], round: 0.72,
    feats: [
      C(-0.5, 0.5, -0.1), C(0.5, 0.5, -0.3), C(-0.5, -0.5, 0.2), C(0.5, -0.5, 0.0),
      R(-0.86, -0.4, -0.86, 0.4, -1.4), R(0.86, -0.38, 0.86, 0.38, -1.7),
    ],
    grooves: [G(-0.76, 0.0, 0.76, 0.0, 0.8), G(0.0, -1.05, 0.0, 1.05, 0.6)],
    pits: [P(0.0, 0.0, 0.4), P(-0.68, 0.0, 0.3), P(0.68, 0.0, 0.3)],
    roots: [
      { pts: [[-2.3, -2.6, 0, 1.75], [-2.3, -8, 0, 1.4], [-1.1, -12.6, 0, 0.5]], sx: 1, sz: 0.48 },
      { pts: [[2.3, -2.6, 0, 1.65], [2.4, -7.6, 0, 1.3], [2.1, -11.8, 0, 0.5]], sx: 1, sz: 0.5 },
    ],
  };
  T.L8 = {
    kind: 'molar', H: 6.8, MD: 10.0, cMD: 7.8, BL: 9.6, cBL: 8.8, trunk: 2.5, cejM: 0.7, cejD: 0.3,
    enamel: [1.2, 2.0], round: 0.8, irregular: 0.4,
    feats: [
      C(-0.5, 0.48, -0.1), C(0.45, 0.46, -0.5), C(-0.48, -0.5, 0.15), C(0.48, -0.46, -0.2),
      R(-0.85, -0.4, -0.85, 0.4, -1.5), R(0.85, -0.35, 0.85, 0.35, -1.9),
    ],
    grooves: [G(-0.7, 0.0, 0.7, 0.0, 0.75), G(0.0, -1.0, 0.05, 1.0, 0.55)],
    pits: [P(0.0, 0.0, 0.4)],
    roots: [{ pts: [[0, -2.2, 0, 3.0], [0.6, -6.5, 0, 2.3], [2.0, -10.2, 0, 0.9]], sx: 1, sz: 0.7 }],
  };

  for (const [code, d] of Object.entries(T)) {
    d.code = code;
    d.jaw = code[0];
    d.pos = +code[1];
    d.name = TOOTH_NAMES[d.pos];
    d.roots = d.roots || null;
    d.round = d.round ?? 0.8;
    d.taperL = d.taperL ?? 0;
    d.skew = d.skew ?? 0;
    d.bend = d.bend ?? 0;
    if (d.kind === 'incisor') d.keys = incisorKeys(d);
    else if (d.kind === 'canine') d.keys = canineKeys(d);
    else if (d.kind === 'premolar') d.keys = premolarKeys(d);
    else d.keys = molarKeys(d);
    if (d.kind === 'molar') d.L = Math.max(...d.roots.flatMap((r) => r.pts.map((p) => -p[1] + p[3] * 0.5)));
    if (d.bifurcation) d.L = Math.max(...d.roots.flatMap((r) => r.pts.map((p) => -p[1] + p[3] * 0.5)));
    d.am = d.MD / 2;
    d.bm = d.BL / 2;
    d.aNeck = d.cMD / 2;
    d.bNeck = d.cBL / 2;
    // contact height (crown fraction) used for papillae
    d.contactY = d.kind === 'incisor' ? 0.78 * d.H : d.kind === 'canine' ? 0.68 * d.H : 0.66 * d.H;
  }
  return T;
}

export const TOOTH_TYPES = makeTypes();

// Where the bucco-lingual section plane goes (molars: through the mesial root rather than the furcation).
export function sectionOffset(def, plane) {
  if (plane !== 'bl' || def.kind !== 'molar' || !def.roots || def.roots.length < 2) return 0;
  return def.roots[0].pts[0][0] * 0.95;
}

// CEJ height above the facial CEJ point at local x (curves occlusally on proximal surfaces).
export function cejHeight(def, x) {
  const t = clamp(Math.abs(x) / def.aNeck, 0, 1);
  const s = t * t * (3 - 2 * t);
  return (x < 0 ? def.cejM : def.cejD) * s * s;
}

// ---------------------------------------------------------------------------
// SDF builder

/**
 * mods: {
 *   cavities: [{x,y,z,r}],          // carious cavities (subtracted spheres, noisy)
 *   chip: {nx,ny,nz,d},             // fracture: removes half-space n·p > d
 *   wear: number,                   // mm removed from the occlusal / incisal surface
 *   crownOnly: bool,                // implant crown
 *   prep: number                    // crown preparation (shrinks crown by mm)
 * }
 */
export function buildTooth(def, mods = {}) {
  const prof = makeProfile(def.keys, 0.04);
  const H = def.H;
  const yBot = def.keys[0][0];
  const am = def.am, bm = def.bm;
  const seed = def.code.charCodeAt(0) * 31 + def.pos * 7;

  // ---- occlusal surface height h(x,z)
  let occ;
  let occMin = H - 3;
  if (def.kind === 'incisor') {
    occ = (x, z) => {
      const tm = smoothstep(0.42, 1.02, -x / am), td = smoothstep(0.32, 1.02, x / am);
      return H - def.mDrop * tm * tm * 1.6 - def.dDrop * td * td * 1.3 - 0.12 * Math.max(0, -z);
    };
    occMin = H - Math.max(def.mDrop, def.dDrop) * 1.7 - 1.5;
  } else if (def.kind === 'canine') {
    const tx = def.tipX;
    occ = (x, z) => {
      const dx = x - tx;
      const s = dx < 0 ? def.slopeM : def.slopeD;
      const d = Math.sqrt(dx * dx + z * z * 0.18 + 0.36) - 0.6;
      return H - s * d;
    };
    occMin = H - 0.75 * (am + 1) - 2;
  } else {
    const feats = def.feats.map((f) =>
      f.t === 0
        ? { ...f, x: f.x * am, z: f.z * bm, h: H + f.dh }
        : { ...f, ax: f.ax * am, az: f.az * bm, bx: f.bx * am, bz: f.bz * bm, h: H + f.dh },
    );
    const grooves = def.grooves.map((g) => ({ ...g, ax: g.ax * am, az: g.az * bm, bx: g.bx * am, bz: g.bz * bm }));
    const pits = def.pits.map((p) => ({ ...p, x: p.x * am, z: p.z * bm }));
    const irr = def.irregular || 0;
    occ = (x, z) => {
      let h = -1e9;
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        let d;
        if (f.t === 0) {
          const dx = (x - f.x) * f.ex, dz = (z - f.z) * f.ez;
          d = Math.sqrt(dx * dx + dz * dz + f.r * f.r) - f.r;
        } else {
          d = segDist2(x, z, f.ax, f.az, f.bx, f.bz);
          d = Math.sqrt(d * d + f.r * f.r) - f.r;
        }
        h = smax(h, f.h - f.s * d, 0.7);
      }
      for (let i = 0; i < grooves.length; i++) {
        const g = grooves[i];
        const d = segDist2(x, z, g.ax, g.az, g.bx, g.bz);
        h -= g.d * Math.exp(-(d * d) / (g.w * g.w));
      }
      for (let i = 0; i < pits.length; i++) {
        const p = pits[i];
        const dx = x - p.x, dz = z - p.z;
        h -= p.d * Math.exp(-(dx * dx + dz * dz) / (p.w * p.w));
      }
      if (irr) h += irr * fbm3(x * 0.45, 3.1, z * 0.45, 2, seed);
      return h;
    };
    occMin = H - 0.75 * Math.max(am, bm) - 3;
  }

  occ = tabulate2D(occ, -am - 1.5, -bm - 1.5, am + 1.5, bm + 1.5, 0.045);

  // ---- incisor lingual fossa
  let fossa = null;
  if (def.fossa) {
    const fy = 0.56 * H;
    const p = prof.at(fy);
    const Bl = p[2];
    const f = def.fossa;
    const rz = f.rz, zc = -Bl + f.depth - rz;
    const rx = f.rx * am, ry = f.ry * H;
    fossa = (x, y, z) => ellipsoid(x, y - fy, z - zc, rx, ry, rz);
  }

  // ---- roots: chains of segments with elliptical cross-sections (rx = r / sx, rz = r / sz)
  const roots = [];
  let rootTop = -1e9;
  if (def.roots) {
    for (const r of def.roots) {
      const segs = [];
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        segs.push(ellipticSegment(a, b, a[3] / r.sx, a[3] / r.sz, b[3] / r.sx, b[3] / r.sz, i === r.pts.length - 2));
      }
      const box = sphereBox(r.pts, r.sx, r.sz);
      const ns = segs.length;
      roots.push(
        culled((x, y, z) => {
          let d = 1e9;
          for (let i = 0; i < ns; i++) d = smin(d, segs[i](x, y, z), 0.4);
          return d;
        }, ...box, 9),
      );
      rootTop = Math.max(rootTop, r.pts[0][1] + r.pts[0][3] + 1);
    }
  }

  const round = def.round, taperL = def.taperL, skew = def.skew;
  const ridgeB = def.ridgeB || 0, ridgeL = def.ridgeL || 0;
  const bend = def.bend, Lr = def.L;

  function body(x, y, z) {
    const p = prof.at(y);
    const A = p[0], Bb = p[1], Bl = p[2];
    const cz = (Bb - Bl) * 0.5, B = (Bb + Bl) * 0.5;
    if (bend && y < 0) {
      const t = smoothstep(-0.35 * Lr, -Lr, y);
      x -= bend * t * t;
    }
    const zz = z - cz;
    let ax = x + skew * zz;
    if (taperL > 0) {
      const t = -zz / B;
      if (t > 0) ax *= 1 + taperL * (t < 1 ? t : 1);
    }
    const r = round * Math.min(A, B);
    let d = roundRect(ax, zz, A, B, r);
    if ((ridgeB || ridgeL) && y > 0) {
      const w = smoothstep(0.1 * H, 0.75 * H, y) * Math.exp(-(x * x) / 1.8);
      d -= (zz > 0 ? ridgeB : ridgeL) * w;
    }
    return smax(d, yBot - y, 0.9);
  }

  function base(x, y, z) {
    let d = body(x, y, z);
    if (roots.length && y < rootTop) {
      for (let i = 0; i < roots.length; i++) d = smin(d, roots[i](x, y, z), 1.6);
    }
    if (d > 4.5) return d; // the remaining terms only push the value further out
    if (y > occMin) d = smax(d, y - occ(x, z), 0.35);
    if (fossa && y > 0.2 * H) d = smax(d, -fossa(x, y, z), 0.6);
    return d;
  }

  // ---- enamel thickness and inner layers (always from the intact tooth)
  const eSide = def.enamel[0], eTop = def.enamel[1];
  const enamelT = (x, y) => {
    const cej = cejHeight(def, x);
    return eSide * smoothstep(cej, cej + 2.4, y) + (eTop - eSide) * smoothstep(H * 0.45, H, y);
  };
  const dentin = (x, y, z) => base(x, y, z) + enamelT(x, y);

  // ---- pulp
  const pulp = buildPulp(def, prof);

  // ---- modifications
  const cav = (mods.cavities || []).map((c) => ({ ...c }));
  const chip = mods.chip || null;
  const wear = mods.wear || 0;
  const crownOnly = !!mods.crownOnly;
  const hasMods = cav.length || chip || wear || crownOnly;

  function evalTooth(x, y, z) {
    let d = base(x, y, z);
    if (!hasMods) return d;
    if (wear > 0) {
      const cut = y - (H - wear) + 0.15 * Math.max(0, -z) * (def.kind === 'incisor' ? 1 : 0);
      d = smax(d, cut, 0.25);
    }
    for (let i = 0; i < cav.length; i++) {
      const c = cav[i];
      const n = 0.18 * c.r * fbm3(x * 1.3, y * 1.3, z * 1.3, 2, 11 + i);
      const s = Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2) - c.r - n;
      d = smax(d, -s, 0.3);
    }
    if (chip) {
      const pl = x * chip.nx + y * chip.ny + z * chip.nz - chip.d;
      const n = 0.12 * fbm3(x * 2.2, y * 2.2, z * 2.2, 2, 23);
      d = Math.max(d, pl + n); // removes the part beyond the fracture plane
    }
    if (crownOnly) d = smax(d, -0.4 - y, 0.4);
    return d;
  }

  // ---- bounds
  let maxA = 0, maxBb = 0, maxBl = 0;
  for (const k of def.keys) {
    maxA = Math.max(maxA, k[1]);
    maxBb = Math.max(maxBb, k[2]);
    maxBl = Math.max(maxBl, k[3]);
  }
  let bx0 = -maxA - 1.2, bx1 = maxA + 1.2, bz0 = -maxBl - 1.2, bz1 = maxBb + 1.2;
  let by0 = yBot - 1.2;
  if (def.roots) {
    for (const r of def.roots) {
      for (const p of r.pts) {
        const rx = p[3] / r.sx, rz = p[3] / r.sz;
        bx0 = Math.min(bx0, p[0] - rx - 1.2);
        bx1 = Math.max(bx1, p[0] + rx + 1.2);
        bz0 = Math.min(bz0, p[2] - rz - 1.2);
        bz1 = Math.max(bz1, p[2] + rz + 1.2);
        by0 = Math.min(by0, p[1] - p[3] - 1.2);
      }
    }
  }
  if (bend) {
    bx1 += bend;
  }
  const bounds = [bx0, crownOnly ? -2 : by0, bz0, bx1, H + 1.4, bz1];

  return {
    def,
    eval: evalTooth,
    base,
    body,
    dentin,
    pulp: pulp.eval,
    pulpBounds: pulp.bounds,
    enamelT,
    bounds,
  };
}

// Tapered segment a->b with an elliptical cross-section (radii rx/rz across the axis, measured
// along directions closest to the tooth's x / z axes). The apical end is capped with a rounded tip.
function ellipticSegment(a, b, rxa, rza, rxb, rzb, roundEnd) {
  const ax = a[0], ay = a[1], az = a[2];
  let nx = b[0] - ax, ny = b[1] - ay, nz = b[2] - az;
  const L = Math.sqrt(nx * nx + ny * ny + nz * nz);
  nx /= L; ny /= L; nz /= L;
  // u: x axis made orthogonal to the segment, w = n x u
  let ux = 1 - nx * nx, uy = -nx * ny, uz = -nx * nz;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= ul; uy /= ul; uz /= ul;
  const wx = ny * uz - nz * uy, wy = nz * ux - nx * uz, wz = nx * uy - ny * ux;
  const rEnd = Math.min(rxb, rzb);
  return (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const t = px * nx + py * ny + pz * nz;
    const tc = t < 0 ? 0 : t > L ? L : t;
    const f = tc / L;
    let rx = rxa + (rxb - rxa) * f, rz = rza + (rzb - rza) * f;
    // round the apex: shrink the section over the last radius
    if (roundEnd && tc > L - rEnd) {
      const k = Math.sqrt(Math.max(0, 1 - ((tc - (L - rEnd)) / rEnd) ** 2));
      rx *= k; rz *= k;
    }
    const ox = px - nx * tc, oy = py - ny * tc, oz = pz - nz * tc;
    const cu = ox * ux + oy * uy + oz * uz, cw = ox * wx + oy * wy + oz * wz;
    const e = rx > 1e-3 && rz > 1e-3 ? ellipse2(cu, cw, rx, rz) : Math.sqrt(cu * cu + cw * cw);
    const over = t - tc;
    if (over === 0) return e;
    const eo = e > 0 ? e : 0;
    return Math.sqrt(eo * eo + over * over) + (e < 0 ? e * 0 : 0);
  };
}

// Samples a height field h(x,z) into a table and returns a bilinear lookup.
function tabulate2D(fn, x0, z0, x1, z1, step) {
  const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const t = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) t[i + j * nx] = fn(x0 + i * step, z0 + j * step);
  const inv = 1 / step;
  return (x, z) => {
    let fx = (x - x0) * inv, fz = (z - z0) * inv;
    fx = fx < 0 ? 0 : fx > nx - 1.001 ? nx - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > nz - 1.001 ? nz - 1.001 : fz;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const k = i + j * nx;
    const a = t[k] + (t[k + 1] - t[k]) * u;
    const b = t[k + nx] + (t[k + nx + 1] - t[k + nx]) * u;
    return a + (b - a) * v;
  };
}

function buildPulp(def, prof) {
  const H = def.H, am = def.am, bm = def.bm;
  let roof, floor, sA, sB, sAr, sBr;
  const horns = [];
  const canals = [];
  if (def.kind === 'incisor') {
    roof = 0.6 * H; sA = 0.3; sB = 0.3; sAr = 0.3; sBr = 0.3;
    floor = -def.L + 0.8;
    horns.push([-0.55 * am, 0, H - 3.0], [0.55 * am, 0, H - 3.0]);
  } else if (def.kind === 'canine') {
    roof = 0.5 * H; sA = 0.3; sB = 0.3; sAr = 0.3; sBr = 0.3;
    floor = -def.L + 0.9;
    horns.push([def.tipX, 0, H - 3.5]);
  } else {
    sA = def.kind === 'molar' ? 0.5 : 0.36;
    sB = def.kind === 'molar' ? 0.48 : 0.4;
    sAr = 0.3; sBr = 0.3;
    roof = def.kind === 'molar' ? 0.3 * H : 0.42 * H;
    if (def.kind === 'molar') floor = -def.trunk + 0.4;
    else if (def.bifurcation) floor = -def.bifurcation + 0.3;
    else floor = -def.L + 0.9;
    for (const f of def.feats) {
      if (f.t !== 0 || f.dh < -2) continue;
      horns.push([f.x * am * 0.62, f.z * bm * 0.55, H - def.enamel[1] - 1.5 + f.dh * 0.5]);
    }
    if (def.roots) {
      for (const r of def.roots) {
        const pts = r.pts.map((p, i, arr) => {
          const last = i === arr.length - 1;
          let [x, y, z, rad] = p;
          if (last) {
            const q = arr[i - 1];
            const dx = x - q[0], dy = y - q[1], dz = z - q[2];
            const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const k = (l - 0.7) / l;
            x = q[0] + dx * k; y = q[1] + dy * k; z = q[2] + dz * k;
          }
          return [x, y, z, Math.max(0.13, rad * 0.26)];
        });
        // start canal inside the chamber
        pts[0] = [pts[0][0] * 0.7, floor + 0.6, pts[0][2] * 0.7, pts[0][3] * 1.6];
        const segs = [];
        const sx = r.sx, sz = r.sz, c = pts[0];
        const tp = pts.map((p) => [c[0] + (p[0] - c[0]) * sx, p[1], c[2] + (p[2] - c[2]) * sz, p[3]]);
        for (let i = 0; i < tp.length - 1; i++) {
          const a = tp[i], b = tp[i + 1];
          segs.push(roundCone(a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3]));
        }
        const k = 1 / Math.max(sx, sz, 1);
        const ns = segs.length;
        const box = sphereBox(pts, sx, sz);
        canals.push(culled((x, y, z) => {
          const X = c[0] + (x - c[0]) * sx, Z = c[2] + (z - c[2]) * sz;
          let d = 1e9;
          for (let i = 0; i < ns; i++) {
            const v = segs[i](X, y, Z);
            if (v < d) d = v;
          }
          return d * k;
        }, ...box, 1.2));
      }
    }
  }
  const hornFns = horns.map(([hx, hz, top]) =>
    culled(
      roundCone(hx * 0.6, roof - 1.2, hz * 0.6, hx, top, hz, 0.75, 0.32),
      ...sphereBox([[hx * 0.6, roof - 1.2, hz * 0.6, 0.75], [hx, top, hz, 0.32]]),
      1.2,
    ),
  );
  const bend = def.bend, Lr = def.L;

  const nh = hornFns.length, nc = canals.length;
  const evalPulp = (x, y, z) => {
    let d = 1e9;
    if (y > floor - 1 && y < roof + 1.5) {
      const p = prof.at(y);
      const w = smoothstep(-1.2, 1.2, y);
      const kA = mix(sAr, sA, w), kB = mix(sBr, sB, w);
      const cz = (p[1] - p[2]) * 0.5;
      const A = Math.max(p[0] * kA, 0.1), B = Math.max(((p[1] + p[2]) * 0.5) * kB, 0.1);
      let xx = x;
      if (bend && y < 0) {
        const t = smoothstep(-0.35 * Lr, -Lr, y);
        xx -= bend * t * t;
      }
      d = ellipse2(xx, z - cz, A, B);
      d = smax(d, y - roof, 0.9);
      d = smax(d, floor - y, 0.5);
    }
    for (let i = 0; i < nh; i++) d = smin(d, hornFns[i](x, y, z), 0.6);
    for (let i = 0; i < nc; i++) d = smin(d, canals[i](x, y, z), 0.6);
    return d;
  };

  const maxA = Math.max(...def.keys.map((k) => k[1]));
  const maxB = Math.max(...def.keys.map((k) => Math.max(k[2], k[3])));
  let by0 = floor - 1;
  if (def.roots) by0 = -def.L - 0.5;
  const bounds = [-maxA * 0.75 - 1.5, by0, -maxB * 0.75 - 1.5, maxA * 0.75 + 1.5 + (bend || 0), H - 0.5, maxB * 0.75 + 1.5];
  if (def.roots) {
    for (const r of def.roots) {
      for (const p of r.pts) {
        bounds[0] = Math.min(bounds[0], p[0] - 1.2);
        bounds[3] = Math.max(bounds[3], p[0] + 1.2);
        bounds[2] = Math.min(bounds[2], p[2] - 1.2);
        bounds[5] = Math.max(bounds[5], p[2] + 1.2);
      }
    }
  }
  return { eval: evalPulp, bounds };
}
