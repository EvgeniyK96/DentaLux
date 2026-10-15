// Gingiva and bone (mandible / maxilla) as signed distance fields built around the tooth layout.
// Gum and alveolar bone are unions of per-tooth shells (the tooth SDF inflated and clipped at the
// gingival margin / alveolar crest), so recession, bone loss and extractions are just parameters.

import { computeLayout, jawSequence } from './layout.js';
import { TOOTH_TYPES, buildTooth, cejHeight } from './teeth.js';
import { meshSDF, sampleGrid, surfaceNets } from '../core/surfaceNets.js';
import { clamp, mix, smoothstep, smin, smax, roundRect, ellipsoid, capsule, roundCone, fbm3 } from '../core/math.js';

// ---------------------------------------------------------------------------
// Polyline helpers (xz plane)

class Polyline {
  constructor(pts, params = null) {
    this.n = pts.length;
    this.x = new Float64Array(pts.map((p) => p[0]));
    this.z = new Float64Array(pts.map((p) => p[1]));
    this.cum = new Float64Array(this.n);
    for (let i = 1; i < this.n; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    this.length = this.cum[this.n - 1];
    this.mid = this.length / 2;
    this.params = params; // per-point parameter arrays
  }
  // signed distance (positive = outward / left of travel direction rotated), arc position
  closest(px, pz, out) {
    let best = 1e18, bi = 0, bt = 0;
    const X = this.x, Z = this.z;
    for (let i = 0; i < this.n - 1; i++) {
      const ax = X[i], az = Z[i], dx = X[i + 1] - ax, dz = Z[i + 1] - az;
      let t = ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (ax + dx * t), ez = pz - (az + dz * t);
      const d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        bi = i;
        bt = t;
      }
    }
    const dx = X[bi + 1] - X[bi], dz = Z[bi + 1] - Z[bi];
    const cx = X[bi] + dx * bt, cz = Z[bi] + dz * bt;
    // outward normal of travel direction: (-dz, dx)
    const side = (px - cx) * -dz + (pz - cz) * dx;
    const dist = Math.sqrt(best);
    out.u = side >= 0 ? dist : -dist;
    out.s = this.cum[bi] + (this.cum[bi + 1] - this.cum[bi]) * bt;
    out.i = bi;
    out.t = bt;
    return out;
  }
  param(k, out) {
    const p = this.params[k];
    return p[out.i] + (p[out.i + 1] - p[out.i]) * out.t;
  }
}

function catmullDense(pts, sub = 6) {
  const ext = [
    [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1], ...pts[0].slice(2)],
    ...pts,
    [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1], ...pts[pts.length - 1].slice(2)],
  ];
  const out = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const row = [];
      for (let c = 0; c < p1.length; c++) {
        if (c < 2) {
          row.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
        } else row.push(p1[c] + (p2[c] - p1[c]) * t);
      }
      out.push(row);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Static skeletal parameters

// Basal arch of the mandible (patient's right half): x, z, yTop, yBot, half width, chin shift
const BASAL_L = [
  [0, 16.5, -15.5, -33.5, 6.8, 3.2],
  [-8.5, 14.6, -15, -32.8, 6.4, 2.2],
  [-15.8, 9.6, -14.5, -31.6, 6.0, 0.6],
  [-20.6, 2.4, -14, -30.4, 6.1, 0],
  [-23.7, -6.5, -13.5, -29.4, 6.7, 0],
  [-26.2, -16.5, -12.5, -28.4, 7.1, 0],
  [-29.0, -26, -10, -27.4, 6.8, 0],
  [-33.5, -35.5, -7, -26.2, 5.6, 0],
  [-38.6, -45, -4, -25.2, 4.8, 0],
  [-42.6, -53, -2, -24.0, 4.5, 0],
];

const RAMUS_POLY = [
  [-25, -4], [-29.5, 8], [-33, 18], [-35.5, 26.5], [-38.5, 25.5], [-43, 17.5], [-48, 13], [-54, 13.5],
  [-59, 16.5], [-62, 19.5], [-69.5, 18.5], [-70.5, 8], [-68.5, -6], [-64, -17], [-57.5, -23], [-48, -25.5], [-38, -23.5],
];

const ramusX = (z) => -35.5 - Math.max(0, -z - 26) * 0.27; // right side; mirrored for left

function sdPolygon(px, py, poly) {
  let d = (px - poly[0][0]) ** 2 + (py - poly[0][1]) ** 2;
  let s = 1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
    const vi = poly[i], vj = poly[j];
    const ex = vj[0] - vi[0], ey = vj[1] - vi[1];
    const wx = px - vi[0], wy = py - vi[1];
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= vi[1], c2 = py < vj[1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

// Inferior alveolar canal centre line (right side, world mm) – used for x-ray nerve and sections.
export const NERVE_PATH_R = [
  [-40.5, 4, -48],
  [-38, -4, -42],
  [-34, -14, -34],
  [-30, -21, -25],
  [-27, -24.5, -14],
  [-25, -25.5, -4],
  [-23.4, -24.8, 3],
  [-22.6, -22.6, 6.4],
  [-24.6, -21.2, 7.0],
];
export const MENTAL_FORAMEN_R = [-25.4, -21.0, 7.0];

// ---------------------------------------------------------------------------
// Context

const ctxCache = new Map();
const intactCache = {};
export function intactTooth(code) {
  if (!intactCache[code]) intactCache[code] = buildTooth(TOOTH_TYPES[code], {});
  return intactCache[code];
}

function key(jaw, params) {
  return jaw + JSON.stringify(params || {});
}

export function jawContext(jaw, params = {}) {
  const k = key(jaw, params);
  if (ctxCache.has(k)) return ctxCache.get(k);
  if (ctxCache.size > 12) ctxCache.clear();

  const layout = computeLayout(params.overrides || {});
  const baseLayout = params.overrides ? computeLayout({}) : layout;
  const seq = jawSequence(layout, jaw);
  const baseSeq = jawSequence(baseLayout, jaw);
  const missing = new Set(params.missing || []);
  const impacted = new Set(params.impacted || []);
  const teeth = seq.map((f, i) => {
    const def = TOOTH_TYPES[f.code];
    const tooth = intactTooth(f.code);
    const mode = missing.has(f.fdi) ? 'missing' : impacted.has(f.fdi) ? 'impacted' : 'present';
    const frame = mode === 'impacted' || mode === 'missing' ? baseSeq[i] : f;
    // horizontal culling segment (apex .. crown) in world xz
    const top = frame.toWorld(0, def.H * 0.5, 0), apex = frame.toWorld(0, -def.L, 0);
    return {
      fdi: f.fdi, def, tooth, mode, frame, actual: f,
      rec: (params.recession || {})[f.fdi] || 0,
      loss: (params.boneLoss || {})[f.fdi] || 0,
      ax: top[0], az: top[2], bx: apex[0], bz: apex[2],
      R: Math.max(def.am, def.bm) + 3.6,
      bb: tooth.bounds,
    };
  });

  // papillae between neighbours (skip gaps)
  const papillae = [];
  for (let i = 0; i < teeth.length - 1; i++) {
    const a = teeth[i], b = teeth[i + 1];
    if (a.mode !== 'present' || b.mode !== 'present') continue;
    const fa = a.frame, fb = b.frame;
    // which side of a faces b
    const lb = fa.toLocal(fb.O[0], fb.O[1], fb.O[2], [0, 0, 0]);
    const la = fb.toLocal(fa.O[0], fa.O[1], fa.O[2], [0, 0, 0]);
    const sa = Math.sign(lb[0]) || 1, sb = Math.sign(la[0]) || 1;
    const ca = fa.toWorld(sa * a.def.am * 0.95, a.def.contactY, 0);
    const cb = fb.toWorld(sb * b.def.am * 0.95, b.def.contactY, 0);
    const C = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2];
    const Y = [(fa.Y[0] + fb.Y[0]) / 2, (fa.Y[1] + fb.Y[1]) / 2, (fa.Y[2] + fb.Y[2]) / 2];
    const yl = Math.hypot(...Y);
    for (let k = 0; k < 3; k++) Y[k] /= yl;
    const contactAboveCej = (a.def.contactY + b.def.contactY) / 2;
    const rec = Math.max(a.rec, b.rec);
    const drop = (a.def.kind === 'molar' || b.def.kind === 'molar' ? 1.9 : 1.5) + rec * 1.15;
    const T = [C[0] - Y[0] * drop, C[1] - Y[1] * drop, C[2] - Y[2] * drop];
    const depth = contactAboveCej + 4;
    const B = [C[0] - Y[0] * depth, C[1] - Y[1] * depth, C[2] - Y[2] * depth];
    const rb = (a.def.bNeck + b.def.bNeck) / 2 + 1.1;
    const fn = roundCone(B[0], B[1], B[2], T[0], T[1], T[2], rb, 0.85);
    papillae.push({ fn, x: C[0], z: C[2], R: rb + 4 });
  }

  // CEJ arch through tooth necks (extended beyond the last molars), with CEJ heights
  const cejPts = baseSeq.map((f) => [f.O[0], f.O[2], f.O[1]]);
  const extend = (a, b, l) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz);
    return [b[0] + (dx / d) * l, b[1] + (dz / d) * l, b[2]];
  };
  cejPts.unshift(extend(cejPts[1], cejPts[0], 7));
  cejPts.push(extend(cejPts[cejPts.length - 2], cejPts[cejPts.length - 1], 7));
  const dense = catmullDense(cejPts, 6);
  const cejArch = new Polyline(dense.map((p) => [p[0], p[1]]), { y: dense.map((p) => p[2]) });

  let basal = null;
  if (jaw === 'L') {
    const half = BASAL_L.map((p) => p.slice());
    const full = [...half.slice(1).reverse(), ...half.map((p) => [-p[0], ...p.slice(1)])];
    const dn = catmullDense(full, 6);
    basal = new Polyline(dn.map((p) => [p[0], p[1]]), {
      top: dn.map((p) => p[2]), bot: dn.map((p) => p[3]), hw: dn.map((p) => p[4]), chin: dn.map((p) => p[5]),
    });
  }

  // the palate ends roughly at the distal surface of the second molars
  const m2 = baseSeq.find((f) => f.p === 7);
  const zPost = m2 ? m2.O[2] - 4 : -26;

  const ctx = { jaw, layout, teeth, papillae, cejArch, basal, zPost, params };
  ctxCache.set(k, ctx);
  return ctx;
}

// ---------------------------------------------------------------------------
// Per-tooth shells

const tmpL = [0, 0, 0];

function boxDist(b, x, y, z) {
  const qx = Math.max(b[0] - x, x - b[3], 0), qy = Math.max(b[1] - y, y - b[4], 0), qz = Math.max(b[2] - z, z - b[5], 0);
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

const GUM_MAX = 1.7 + 1.05 + 0.06 * 17 + 0.1;

function gumShell(t, wx, wy, wz) {
  const L = t.frame.toLocal(wx, wy, wz, tmpL);
  const x = L[0], y = L[1], z = L[2];
  if (t.mode === 'present') {
    // the shell never extends more than GUM_MAX beyond the tooth's box; past GUM_MAX + 2.2 the
    // value cannot influence any blend (k <= 1.8), so a lower bound is returned
    const bd = boxDist(t.bb, x, y, z);
    if (bd > GUM_MAX + 2.2) return bd - GUM_MAX;
  }
  const def = t.def;
  const sideT = smoothstep(-1.5, 1.5, z); // 0 lingual .. 1 buccal
  const gb = mix(1.7, 1.15, sideT);
  if (t.mode !== 'present') {
    const top = -1.0 - t.rec * 0.6 - (t.mode === 'missing' ? 0.6 : 0);
    const depth = top - y;
    if (depth > 20) return depth - 17;
    const g = gb + 1.1 + 0.25 * smoothstep(0, 3, depth);
    let d = t.tooth.base(x, Math.min(y, -0.6), z) - g;
    return smax(d, y - top, 2.6);
  }
  const margin = cejHeight(def, x) + 0.9 - t.rec;
  const depth = margin - y;
  if (depth > 20) return depth - 17;
  const g = 0.22 + (gb + 1.05 - 0.22) * smoothstep(0, 2.6, depth) + 0.06 * Math.max(0, depth - 3);
  // below the collar the gum is an extrusion of the neck section: a smooth wall without root valleys
  const yc = margin - 2.8;
  let d = (y > yc ? t.tooth.base(x, y, z) : t.tooth.body(x, yc, z)) - g;
  d = smax(d, y - margin, 0.5);
  return smax(d, depth - 17, 1.0);
}

function boneShell(t, wx, wy, wz) {
  const L = t.frame.toLocal(wx, wy, wz, tmpL);
  const x = L[0], y = L[1], z = L[2];
  if (t.mode === 'present') {
    const bd = boxDist(t.bb, x, y, z);
    if (bd > 5.2) return bd - 1.8; // >= 3.4: cannot influence the k=3 blend with the basal bone
  }
  const sideT = smoothstep(-1.5, 1.5, z);
  const thick = mix(1.7, 1.15, sideT);
  if (t.mode === 'missing') {
    const top = -2.4 - t.loss;
    const d = t.tooth.base(x, Math.min(y, top - 1.0), z) - thick - 0.2;
    return smax(d, y - top, 2.2);
  }
  const crest = cejHeight(t.def, x) - 1.7 - t.loss;
  let d = t.tooth.base(x, y, z) - thick;
  d = smax(d, y - crest, 0.9);
  if (t.mode === 'impacted') {
    // healed ridge over the original position plus a crypt around the displaced tooth
    const Lb = t.frame.toLocal(wx, wy, wz, [0, 0, 0]);
    const top = -2.0;
    let r = t.tooth.base(Lb[0], Math.min(Lb[1], top - 1.0), Lb[2]) - 1.6;
    r = smax(r, Lb[1] - top, 2.2);
    const La = t.actual.toLocal(wx, wy, wz, [0, 0, 0]);
    let c = t.tooth.base(La[0], La[1], La[2]) - 1.2;
    c = smax(c, Lb[1] - (top + 1.2), 1.0);
    return smin(r, c, 1.0);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Jaw-level fields

function palateVault(ctx, ai) {
  const yb = ctx.cejArch.param('y', ai);
  const inside = -ai.u;
  return yb + 3 + 11 * smoothstep(1.5, 12.5, inside);
}

function rugae(x, z, zFront) {
  const t = zFront - z; // distance behind incisors
  if (t < 3 || t > 17) return 0;
  const fade = smoothstep(3, 5, t) * (1 - smoothstep(13, 17, t)) * (1 - smoothstep(6, 12, Math.abs(x)));
  const w = Math.sin(t * 1.9 + Math.sin(x * 0.55) * 1.2 + Math.abs(x) * 0.25);
  return fade * Math.max(0, w) ** 2 * 0.75;
}

function nearTeeth(ctx, x, z, extra = 0) {
  const out = [];
  for (const t of ctx.teeth) {
    // distance from (x,z) to segment a-b
    const dx = t.bx - t.ax, dz = t.bz - t.az;
    let h = ((x - t.ax) * dx + (z - t.az) * dz) / (dx * dx + dz * dz || 1);
    h = clamp(h, 0, 1);
    const ex = x - (t.ax + dx * h), ez = z - (t.az + dz * h);
    if (ex * ex + ez * ez < (t.R + extra) ** 2) out.push(t);
  }
  return out;
}

export function gumSDF(jaw, params = {}) {
  const ctx = jawContext(jaw, params);
  const ai = { u: 0, s: 0, i: 0, t: 0 };
  const zFront = ctx.cejArch.z.reduce((m, v) => Math.max(m, v), -1e9);
  const upper = jaw === 'U';

  const columnFn = (x, z) => {
    ctx.cejArch.closest(x, z, ai);
    const palate = upper && ai.u < 1 && z > ctx.zPost - 3;
    if (ai.u > 12 || (ai.u < -12 && !palate)) return null;
    const near = nearTeeth(ctx, x, z, 2.0);
    const paps = ctx.papillae.filter((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < p.R * p.R);
    if (!near.length && !palate) return null;
    // the attached gingiva / mucosa ends along a smooth line ~12 mm from the necks
    const yb = ctx.cejArch.param('y', ai);
    const clipOff = 8 * (1 - smoothstep(-7, -2.5, ai.u));
    let yv = 0, rug = 0, pal = 0;
    if (palate) {
      yv = palateVault(ctx, ai);
      rug = rugae(x, z, zFront);
      // incisive papilla
      pal = ellipsoid(x, 0, z - (zFront - 8.5), 2.0, 1, 3.4);
    }
    const nn = near.length, np = paps.length;
    const u = ai.u;
    return (y) => {
      let d = 1e3;
      for (let i = 0; i < nn; i++) d = smin(d, gumShell(near[i], x, y, z), 1.8);
      for (let i = 0; i < np; i++) d = smin(d, paps[i].fn(x, y, z), 0.9);
      if (palate) {
        const c = yv - 1.2;
        let m = Math.abs(y - c) - 1.8 - rug;
        if (pal < 1.2) m = smin(m, ellipsoid(x, y - (yv - 2.8), z - (zFront - 8.5), 2.2, 1.5, 3.4), 0.8);
        m = smax(m, u - 0.5, 2.0);
        m = smax(m, ctx.zPost - z, 2.0);
        d = smin(d, m, 1.5);
      }
      const clip = (upper ? y - (yb + 11) : yb - 11 - y) - clipOff;
      return smax(d, clip, 2.6);
    };
  };

  const bounds = upper ? [-40, -2, -46, 40, 30, 33] : [-40, -30, -46, 40, 2, 30];
  return { ctx, column: columnFn, bounds, eval: (x, y, z) => { const c = columnFn(x, z); return c ? c(y) : 1e3; } };
}

export function boneSDF(jaw, params = {}) {
  const ctx = jawContext(jaw, params);
  const ai = { u: 0, s: 0, i: 0, t: 0 };
  const bi = { u: 0, s: 0, i: 0, t: 0 };
  const upper = jaw === 'U';
  const mf = [MENTAL_FORAMEN_R, [-MENTAL_FORAMEN_R[0], MENTAL_FORAMEN_R[1], MENTAL_FORAMEN_R[2]]];
  const neckR = capsule(-45.5, 14, -63, -48.5, 22, -65.5, 3.9);
  const neckL = capsule(45.5, 14, -63, 48.5, 22, -65.5, 3.9);
  const rot = Math.sin(15 * Math.PI / 180), rcs = Math.cos(15 * Math.PI / 180);

  const columnFn = (x, z) => {
    ctx.cejArch.closest(x, z, ai);
    const near = nearTeeth(ctx, x, z, 3.0);
    if (upper) {
      const palate = ai.u < 1 && z > ctx.zPost - 4;
      if (ai.u > 12) return null;
      if (ai.u < -12 && !palate) return null;
      const yb = ctx.cejArch.param('y', ai);
      const s = Math.abs(ai.s - ctx.cejArch.mid);
      const front = 1 - smoothstep(10, 24, s);
      const hw0 = mix(7.0, 5.8, front);
      const yv = palate ? palateVault(ctx, ai) : 0;
      const u = ai.u, nn = near.length;
      return (y) => {
        let d = 1e3;
        for (let i = 0; i < nn; i++) d = smin(d, boneShell(near[i], x, y, z), 1.3);
        // basal band of the maxilla, leaning inwards towards the nasal floor
        const up = Math.max(0, y - yb - 4);
        const uc = -4.2 - (0.1 + front * 0.2) * up;
        const hw = hw0 * (0.68 + 0.32 * smoothstep(yb + 7, yb + 14, y)) * (1 - 0.2 * smoothstep(yb + 14, yb + 24, y));
        const band = roundRect(u - uc, y - (yb + 14.5), hw, 8.5, 4.0);
        d = smin(d, band, 3.0);
        if (palate) {
          let p = Math.abs(y - (yv + 2.0)) - 2.0;
          p = smax(p, u + 1.0, 2.0);
          p = smax(p, ctx.zPost + 1 - z, 2.5);
          d = smin(d, p, 2.5);
        }
        d = smax(d, y - 23.5, 4.0);
        return d;
      };
    }

    // ---- mandible
    ctx.basal.closest(x, z, bi);
    const side = x < 0 ? -1 : 1;
    const xr = side * -ramusX(z); // ramus plane x for this side
    const nearRamus = z < -20 && Math.abs(x - xr) < 11;
    const nearBody = Math.abs(bi.u) < 15;
    const condC = [side * 49.5, 24.5, -66];
    const nearCond = Math.hypot(x - condC[0], z - condC[2]) < 14;
    if (!near.length && !nearRamus && !nearBody && !nearCond) return null;
    const top = ctx.basal.param('top', bi), bot = ctx.basal.param('bot', bi);
    const hw0 = ctx.basal.param('hw', bi), chin = ctx.basal.param('chin', bi);
    const ub = bi.u, nn = near.length;
    const thickHalf = 3.1 + 1.3 * smoothstep(-40, -64, z);
    const ax = Math.abs(x);
    // condyle local (rotated about y)
    const cx = x - condC[0], cz = z - condC[2];
    const crx = cx * rcs - side * cz * rot, crz = side * cx * rot + cz * rcs;
    const neck = side < 0 ? neckR : neckL;
    return (y) => {
      let d = 1e3;
      for (let i = 0; i < nn; i++) d = smin(d, boneShell(near[i], x, y, z), 1.3);
      if (nearBody) {
        const tb = smoothstep(top, bot, y);
        const uc = chin * tb;
        const hw = hw0 * (0.7 + 0.42 * tb);
        const body = roundRect(ub - uc, y - (top + bot) / 2, hw, (top - bot) / 2, Math.min(hw, 4.6));
        d = smin(d, body, 3.0);
      }
      if (nearRamus) {
        const d2 = sdPolygon(z, y, RAMUS_POLY) - 1.2;
        const dx = Math.abs(x - xr) - thickHalf;
        d = smin(d, smax(d2, dx, 2.2), 4.5);
      }
      if (nearCond) {
        d = smin(d, ellipsoid(crx, y - condC[1], crz, 9.6, 5.0, 4.6), 2.0);
        d = smin(d, neck(x, y, z), 2.5);
      }
      // chin
      if (ax < 20 && z > 8) {
        d = smin(d, ellipsoid(x, y + 27.8, z - 20.2, 11.5, 5.6, 3.4), 3.5);
        d = smin(d, ellipsoid(ax - 8, y + 29.5, z - 18.4, 4.2, 3.4, 2.4), 2.5);
      }
      // mental foramina
      for (let k = 0; k < 2; k++) {
        const m = mf[k];
        if (Math.abs(x - m[0]) < 5 && Math.abs(z - m[2]) < 5) d = smax(d, -ellipsoid(x - m[0], y - m[1], z - m[2], 2.2, 1.6, 1.6), 0.6);
      }
      // mandibular foramen (medial side of the ramus)
      if (nearRamus && Math.abs(z + 47) < 5) {
        const fx = xr - side * (thickHalf + 0.2);
        d = smax(d, -ellipsoid(x - fx, y - 6, z + 47, 1.8, 2.4, 2.0), 0.6);
      }
      return d;
    };
  };

  const bounds = upper ? [-42, -2, -46, 42, 30, 33] : [-62, -38, -76, 62, 34, 28];
  return { ctx, column: columnFn, bounds, eval: (x, y, z) => { const c = columnFn(x, z); return c ? c(y) : 1e3; } };
}

// ---------------------------------------------------------------------------
// Meshing entry points

export function meshGum(jaw, params = {}) {
  const sdf = gumSDF(jaw, params);
  const ctx = sdf.ctx;
  const grid = sampleGrid(sdf, sdf.bounds, params.h || 0.46, { band: 4 });
  const ai = { u: 0, s: 0, i: 0, t: 0 };
  return surfaceNets(grid, {
    attrs: {
      // x: depth below the gingival margin (mm), y: palate weight
      aGum: [
        2,
        (x, y, z, o) => {
          let best = 1e9, depth = 20;
          for (const t of nearTeeth(ctx, x, z)) {
            const v = gumShell(t, x, y, z);
            if (v < best) {
              best = v;
              const L = t.frame.toLocal(x, y, z, [0, 0, 0]);
              const top = t.mode === 'present' ? cejHeight(t.def, L[0]) + 0.9 - t.rec : -1.0 - t.rec * 0.6;
              depth = Math.max(0, top - L[1]);
            }
          }
          let pal = 0;
          if (jaw === 'U') {
            ctx.cejArch.closest(x, z, ai);
            pal = smoothstep(-2, -6, ai.u);
            if (pal > 0) depth = mix(depth, 14, pal);
          }
          o[0] = depth;
          o[1] = pal;
        },
      ],
    },
  });
}

export function meshBone(jaw, params = {}) {
  const sdf = boneSDF(jaw, params);
  const grid = sampleGrid(sdf, sdf.bounds, params.h || 0.58, { band: 4 });
  return surfaceNets(grid, {});
}

// Section block: the gum + bone segment around one tooth, meshed in the tooth's local frame.
export function meshBlock(fdi, params = {}, plane = 'bl') {
  const jaw = Math.floor(fdi / 10) <= 2 ? 'U' : 'L';
  const gum = gumSDF(jaw, params);
  const bone = boneSDF(jaw, params);
  const t = gum.ctx.teeth.find((tt) => tt.fdi === fdi);
  const f = t.frame, def = t.def;
  const W = def.am + 0.35;
  const P = [0, 0, 0];
  const toW = (x, y, z) => {
    P[0] = f.O[0] + f.X[0] * x + f.Y[0] * y + f.Z[0] * z;
    P[1] = f.O[1] + f.X[1] * x + f.Y[1] * y + f.Z[1] * z;
    P[2] = f.O[2] + f.X[2] * x + f.Y[2] * y + f.Z[2] * z;
    return P;
  };
  const yMin = jaw === 'L' ? -def.L - 16 : -def.L - 6;
  const slab = (x) => Math.abs(x) - W;
  const gumL = { eval: (x, y, z) => { const p = toW(x, y, z); return Math.max(gum.eval(p[0], p[1], p[2]), slab(x)); } };
  const boneL = { eval: (x, y, z) => { const p = toW(x, y, z); return Math.max(bone.eval(p[0], p[1], p[2]), slab(x), yMin - y); } };
  const b = [-W - 0.6, yMin - 1, -def.bm - 9, W + 0.6, def.H * 0.7, def.bm + 9];
  return {
    gum: meshSDF(gumL, b, 0.3, {}),
    bone: meshSDF(boneL, b, 0.36, {}),
  };
}
