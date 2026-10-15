// Scalar helpers shared by the SDF builders (run both in workers and on the main thread).

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

// Polynomial smooth minimum / maximum (k = blend radius in mm).
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  if (k <= 0) return a > b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a > b ? a : b) + h * h * k * 0.25;
}

export const len2 = (x, y) => Math.sqrt(x * x + y * y);
export const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// Distance from (px,pz) to the 2D segment a-b.
export function segDist2(px, pz, ax, az, bx, bz) {
  const bax = bx - ax, baz = bz - az, pax = px - ax, paz = pz - az;
  let h = (pax * bax + paz * baz) / (bax * bax + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dz * dz);
}

// 2D rounded rectangle centred at the origin.
export function roundRect(x, y, hx, hy, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
  return Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - r;
}

// Approximate ellipse distance (iq) – good enough near the surface.
export function ellipse2(x, y, rx, ry) {
  const k0 = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry));
  const k1 = Math.sqrt((x * x) / (rx * rx * rx * rx) + (y * y) / (ry * ry * ry * ry));
  if (k1 < 1e-9) return -Math.min(rx, ry);
  return (k0 * (k0 - 1)) / k1;
}

export function ellipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz));
  const k1 = Math.sqrt(
    (x * x) / (rx * rx * rx * rx) + (y * y) / (ry * ry * ry * ry) + (z * z) / (rz * rz * rz * rz),
  );
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

// Round cone between points a and b with radii r1 (at a) and r2 (at b). Returns a closure.
export function roundCone(ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const srr = Math.sign(rr) * rr * rr;
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = srr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

// Wraps an SDF closure with an AABB early-out: far from the box we return the box distance
// (a valid lower bound), which keeps signs correct while skipping the expensive evaluation.
export function culled(fn, x0, y0, z0, x1, y1, z1, margin = 2) {
  return (x, y, z) => {
    const qx = x0 - x > x - x1 ? x0 - x : x - x1;
    const qy = y0 - y > y - y1 ? y0 - y : y - y1;
    const qz = z0 - z > z - z1 ? z0 - z : z - z1;
    const ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0, az = qz > 0 ? qz : 0;
    const bd = Math.sqrt(ax * ax + ay * ay + az * az);
    if (bd > margin) return bd;
    return fn(x, y, z);
  };
}

// Bounding box of spheres [[x,y,z,r],...] (with optional per-axis radius scale).
export function sphereBox(pts, sx = 1, sz = 1) {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const rx = p[3] / sx, rz = p[3] / sz;
    if (p[0] - rx < x0) x0 = p[0] - rx;
    if (p[0] + rx > x1) x1 = p[0] + rx;
    if (p[1] - p[3] < y0) y0 = p[1] - p[3];
    if (p[1] + p[3] > y1) y1 = p[1] + p[3];
    if (p[2] - rz < z0) z0 = p[2] - rz;
    if (p[2] + rz > z1) z1 = p[2] + rz;
  }
  return [x0, y0, z0, x1, y1, z1];
}

// Capsule (segment with constant radius) closure.
export function capsule(ax, ay, az, bx, by, bz, r) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const il = 1 / (bax * bax + bay * bay + baz * baz);
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    let h = (pax * bax + pay * bay + paz * baz) * il;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  };
}

// ---------------------------------------------------------------------------
// Deterministic value noise.

function hash3(ix, iy, iz, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise in [-1, 1].
export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, seed), b = hash3(ix + 1, iy, iz, seed);
  const c = hash3(ix, iy + 1, iz, seed), d = hash3(ix + 1, iy + 1, iz, seed);
  const e = hash3(ix, iy, iz + 1, seed), f = hash3(ix + 1, iy, iz + 1, seed);
  const g = hash3(ix, iy + 1, iz + 1, seed), h = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x0 = a + (b - a) * ux, x1 = c + (d - c) * ux, x2 = e + (f - e) * ux, x3 = g + (h - g) * ux;
  const y0 = x0 + (x1 - x0) * uy, y1 = x2 + (x3 - x2) * uy;
  return (y0 + (y1 - y0) * uz) * 2 - 1;
}

export function fbm3(x, y, z, octaves = 3, seed = 0) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// Simple seeded PRNG for deterministic per-tooth variation.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Monotone cubic profile lookup table: keys = [[y, v0, v1, ...], ...] sorted by y.

export function makeProfile(keys, step = 0.05) {
  const n = keys.length;
  const nv = keys[0].length - 1;
  const y0 = keys[0][0], y1 = keys[n - 1][0];
  const count = Math.max(2, Math.ceil((y1 - y0) / step) + 1);
  const tables = [];
  for (let v = 0; v < nv; v++) {
    const ys = keys.map((k) => k[0]);
    const vs = keys.map((k) => k[v + 1]);
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ys[i + 1] - ys[i]));
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else {
        const h0 = ys[i] - ys[i - 1], h1 = ys[i + 1] - ys[i];
        m[i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]);
      }
    }
    const t = new Float32Array(count);
    let seg = 0;
    for (let j = 0; j < count; j++) {
      const y = y0 + ((y1 - y0) * j) / (count - 1);
      while (seg < n - 2 && y > ys[seg + 1]) seg++;
      const h = ys[seg + 1] - ys[seg];
      const s = clamp((y - ys[seg]) / h, 0, 1);
      const s2 = s * s, s3 = s2 * s;
      t[j] =
        (2 * s3 - 3 * s2 + 1) * vs[seg] +
        (s3 - 2 * s2 + s) * h * m[seg] +
        (-2 * s3 + 3 * s2) * vs[seg + 1] +
        (s3 - s2) * h * m[seg + 1];
    }
    tables.push(t);
  }
  const inv = (count - 1) / (y1 - y0);
  const out = new Float64Array(nv);
  return {
    y0,
    y1,
    nv,
    // Writes interpolated values into `out` (reused) and returns it.
    at(y) {
      let f = (y - y0) * inv;
      if (f < 0) f = 0;
      else if (f > count - 1) f = count - 1;
      const i = Math.min(count - 2, f | 0);
      const w = f - i;
      for (let v = 0; v < nv; v++) {
        const t = tables[v];
        out[v] = t[i] + (t[i + 1] - t[i]) * w;
      }
      return out;
    },
  };
}
