// Naive surface nets mesher over a sampled signed distance field.
// Grid layout: index = iy + ny * (ix + nx * iz)  (y is the fastest axis, so SDFs can
// cache per-column work such as closest-point queries on the dental arch).

const FAR = 1e3;

export function sampleGrid(sdf, bounds, h, opts = {}) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.max(2, Math.ceil((x1 - x0) / h) + 1);
  const ny = Math.max(2, Math.ceil((y1 - y0) / h) + 1);
  const nz = Math.max(2, Math.ceil((z1 - z0) / h) + 1);
  const data = new Float32Array(nx * ny * nz);
  let idx = 0;
  const hasColumn = typeof sdf.column === 'function';
  const band = hasColumn && opts.band ? opts.band : 0;
  const thresh = band * h * 1.25 + 0.7;
  const colActive = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    const z = z0 + iz * h;
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + ix * h;
      if (hasColumn) {
        const col = sdf.column(x, z);
        if (col === null) {
          data.fill(FAR, idx, idx + ny);
          idx += ny;
          continue;
        }
        colActive[ix + nx * iz] = 1;
        if (band) {
          // coarse samples along the column, exact evaluation only near the surface
          let prevI = 0, prevV = col(y0);
          data[idx] = prevV;
          for (let c = band; ; c += band) {
            const ci = c < ny - 1 ? c : ny - 1;
            const v = col(y0 + ci * h);
            data[idx + ci] = v;
            const near = Math.min(Math.abs(prevV), Math.abs(v)) < thresh;
            for (let iy = prevI + 1; iy < ci; iy++) {
              data[idx + iy] = near ? col(y0 + iy * h) : prevV + ((v - prevV) * (iy - prevI)) / (ci - prevI);
            }
            prevI = ci;
            prevV = v;
            if (ci === ny - 1) break;
          }
          idx += ny;
        } else {
          for (let iy = 0; iy < ny; iy++) data[idx++] = col(y0 + iy * h);
        }
      } else {
        colActive[ix + nx * iz] = 1;
        for (let iy = 0; iy < ny; iy++) data[idx++] = sdf.eval(x, y0 + iy * h, z);
      }
    }
  }
  return { data, nx, ny, nz, x0, y0, z0, h, colActive };
}

class Growable {
  constructor(Type, cap) {
    this.Type = Type;
    this.a = new Type(cap);
    this.n = 0;
  }
  push(v) {
    if (this.n >= this.a.length) {
      const b = new this.Type(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
  trim() {
    return this.a.slice(0, this.n);
  }
}

const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * @param grid  result of sampleGrid
 * @param opts  { evalFn(x,y,z) exact sdf for refinement/normals, attrs: { name: [itemSize, fn(x,y,z,out)] } }
 */
export function surfaceNets(grid, opts = {}) {
  const { data, nx, ny, nz, x0, y0, z0, h } = grid;
  const sy = 1, sx = ny, sz = nx * ny;
  const vmap = new Int32Array(nx * ny * nz);
  const pos = new Growable(Float32Array, 1 << 15);
  const idx = new Growable(Uint32Array, 1 << 16);
  const off = [0, sx, sy, sx + sy, sz, sz + sx, sz + sy, sz + sx + sy];
  const v = new Float64Array(8);
  let vcount = 0;

  const colActive = grid.colActive;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      if (colActive) {
        const c = ix + nx * iz;
        if (!colActive[c] && !colActive[c + 1] && !colActive[c + nx] && !colActive[c + nx + 1]) continue;
      }
      let base = sx * ix + sz * iz;
      for (let iy = 0; iy < ny - 1; iy++, base++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = data[base + off[c]];
          v[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const c0 = EDGES[e][0], c1 = EDGES[e][1];
          const in0 = (mask >> c0) & 1, in1 = (mask >> c1) & 1;
          if (in0 === in1) continue;
          const t = v[c0] / (v[c0] - v[c1]);
          const p0x = c0 & 1, p0y = (c0 >> 1) & 1, p0z = (c0 >> 2) & 1;
          const p1x = c1 & 1, p1y = (c1 >> 1) & 1, p1z = (c1 >> 2) & 1;
          ax += p0x + (p1x - p0x) * t;
          ay += p0y + (p1y - p0y) * t;
          az += p0z + (p1z - p0z) * t;
          cnt++;
        }
        pos.push(x0 + (ix + ax / cnt) * h);
        pos.push(y0 + (iy + ay / cnt) * h);
        pos.push(z0 + (iz + az / cnt) * h);
        vmap[base] = ++vcount; // 1-based

        // Quads for the three edges leaving corner 0.
        const in0 = mask & 1;
        // +x edge (corner0 -> corner1): cells (base, -sy, -sy-sz, -sz)
        if (((mask >> 1) & 1) !== in0 && iy > 0 && iz > 0) {
          emitQuad(idx, vmap, pos, base, base - sy, base - sy - sz, base - sz, in0);
        }
        // +y edge (corner0 -> corner2): cells (base, -sz, -sz-sx, -sx)
        if (((mask >> 2) & 1) !== in0 && iz > 0 && ix > 0) {
          emitQuad(idx, vmap, pos, base, base - sz, base - sz - sx, base - sx, in0);
        }
        // +z edge (corner0 -> corner4): cells (base, -sx, -sx-sy, -sy)
        if (((mask >> 4) & 1) !== in0 && ix > 0 && iy > 0) {
          emitQuad(idx, vmap, pos, base, base - sx, base - sx - sy, base - sy, in0);
        }
      }
    }
  }

  const positions = pos.trim();
  const indices = idx.trim();
  const nv = positions.length / 3;
  const normals = new Float32Array(nv * 3);
  const evalFn = opts.evalFn;

  if (evalFn) {
    // Project onto the exact surface (one Newton step) and take analytic normals
    // using the tetrahedral gradient technique (4 evaluations per estimate).
    const e = h * 0.2;
    const g = new Float64Array(4);
    const tetra = (px, py, pz) => {
      const a = evalFn(px + e, py - e, pz - e);
      const b = evalFn(px - e, py - e, pz + e);
      const c = evalFn(px - e, py + e, pz - e);
      const d = evalFn(px + e, py + e, pz + e);
      g[0] = (a + b + c + d) * 0.25;
      g[1] = (a - b - c + d) / (4 * e);
      g[2] = (-a - b + c + d) / (4 * e);
      g[3] = (-a + b - c + d) / (4 * e);
    };
    for (let i = 0; i < nv; i++) {
      let px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
      tetra(px, py, pz);
      const gl2 = g[1] * g[1] + g[2] * g[2] + g[3] * g[3];
      if (gl2 > 1e-10) {
        let s = g[0] / gl2;
        const len = Math.abs(s) * Math.sqrt(gl2);
        if (len > h * 0.6) s *= (h * 0.6) / len;
        px -= s * g[1];
        py -= s * g[2];
        pz -= s * g[3];
        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
        tetra(px, py, pz);
      }
      const gl = Math.sqrt(g[1] * g[1] + g[2] * g[2] + g[3] * g[3]) || 1;
      normals[i * 3] = g[1] / gl;
      normals[i * 3 + 1] = g[2] / gl;
      normals[i * 3 + 2] = g[3] / gl;
    }
  } else {
    gridRefineAndNormals(grid, positions, normals);
  }

  const attributes = {};
  if (opts.attrs) {
    for (const [name, [size, fn]] of Object.entries(opts.attrs)) {
      const arr = new Float32Array(nv * size);
      const out = new Float64Array(size);
      for (let i = 0; i < nv; i++) {
        fn(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], out, normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
        for (let k = 0; k < size; k++) arr[i * size + k] = out[k];
      }
      attributes[name] = { array: arr, itemSize: size };
    }
  }

  return { positions, normals, indices, attributes };
}

function emitQuad(idx, vmap, pos, a, b, c, d, inside0) {
  const va = vmap[a] - 1, vb = vmap[b] - 1, vc = vmap[c] - 1, vd = vmap[d] - 1;
  if (va < 0 || vb < 0 || vc < 0 || vd < 0) return;
  let q0, q1, q2, q3;
  if (inside0) { q0 = va; q1 = vb; q2 = vc; q3 = vd; }
  else { q0 = va; q1 = vd; q2 = vc; q3 = vb; }
  // split along the shorter diagonal
  const P = pos.a;
  const d02 = dist2(P, q0, q2), d13 = dist2(P, q1, q3);
  if (d02 <= d13) {
    idx.push(q0); idx.push(q1); idx.push(q2);
    idx.push(q0); idx.push(q2); idx.push(q3);
  } else {
    idx.push(q0); idx.push(q1); idx.push(q3);
    idx.push(q1); idx.push(q2); idx.push(q3);
  }
}

function dist2(P, i, j) {
  const dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

// Refinement + normals using only the sampled grid (trilinear field, central-difference gradients).
function gridRefineAndNormals(grid, positions, normals) {
  const { data, nx, ny, nz, x0, y0, z0, h } = grid;
  const sx = ny, sz = nx * ny;
  const at = (ix, iy, iz) => {
    ix = ix < 0 ? 0 : ix >= nx ? nx - 1 : ix;
    iy = iy < 0 ? 0 : iy >= ny ? ny - 1 : iy;
    iz = iz < 0 ? 0 : iz >= nz ? nz - 1 : iz;
    return data[iy + sx * ix + sz * iz];
  };
  const g = new Float64Array(4);
  // trilinear value and central-difference gradient at a point
  const sample = (px, py, pz) => {
    const fx = (px - x0) / h, fy = (py - y0) / h, fz = (pz - z0) / h;
    let ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    ix = Math.min(Math.max(ix, 0), nx - 2);
    iy = Math.min(Math.max(iy, 0), ny - 2);
    iz = Math.min(Math.max(iz, 0), nz - 2);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    let val = 0, gx = 0, gy = 0, gz = 0;
    for (let c = 0; c < 8; c++) {
      const cx = c & 1, cy = (c >> 1) & 1, cz = (c >> 2) & 1;
      const w = (cx ? tx : 1 - tx) * (cy ? ty : 1 - ty) * (cz ? tz : 1 - tz);
      const X = ix + cx, Y = iy + cy, Z = iz + cz;
      val += w * at(X, Y, Z);
      gx += w * (at(X + 1, Y, Z) - at(X - 1, Y, Z));
      gy += w * (at(X, Y + 1, Z) - at(X, Y - 1, Z));
      gz += w * (at(X, Y, Z + 1) - at(X, Y, Z - 1));
    }
    g[0] = val;
    g[1] = gx / (2 * h);
    g[2] = gy / (2 * h);
    g[3] = gz / (2 * h);
    return g;
  };
  const nv = positions.length / 3;
  for (let i = 0; i < nv; i++) {
    let px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
    for (let it = 0; it < 2; it++) {
      sample(px, py, pz);
      const gl2 = g[1] * g[1] + g[2] * g[2] + g[3] * g[3];
      if (gl2 < 1e-8) break;
      let s = g[0] / gl2;
      const len = Math.abs(s) * Math.sqrt(gl2);
      if (len > h * 0.5) s *= (h * 0.5) / len;
      px -= s * g[1];
      py -= s * g[2];
      pz -= s * g[3];
    }
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;
    sample(px, py, pz);
    const l = Math.sqrt(g[1] * g[1] + g[2] * g[2] + g[3] * g[3]) || 1;
    normals[i * 3] = g[1] / l;
    normals[i * 3 + 1] = g[2] / l;
    normals[i * 3 + 2] = g[3] / l;
  }
}

export function meshSDF(sdf, bounds, h, opts = {}) {
  const grid = sampleGrid(sdf, bounds, h, opts);
  return surfaceNets(grid, opts);
}
