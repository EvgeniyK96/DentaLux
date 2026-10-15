// Auxiliary meshes generated in the worker: calculus deposits and dental implants.
import { TOOTH_TYPES, cejHeight } from './teeth.js';
import { intactTooth } from './jaw.js';
import { meshSDF } from '../core/surfaceNets.js';
import { smoothstep, smax, smin, fbm3, noise3 } from '../core/math.js';

const colOf = (fn) => ({ column: (x, z) => (y) => fn(x, y, z) });

// Calculus deposits around the neck of a tooth (canonical tooth frame).
// side: 'lingual' | 'buccal' | 'all'; amount 0..1; sub: subgingival extension (mm)
export function calculusSDF(code, amount, side = 'all', sub = 0, seed = 1) {
  const def = TOOTH_TYPES[code];
  const t = intactTooth(code);
  const thick = 0.25 + 0.75 * amount;
  return (x, y, z) => {
    const cej = cejHeight(def, x);
    const top = cej + 0.6 + 1.6 * amount;
    const bot = cej - 0.4 - sub;
    let sideW = 1;
    if (side === 'lingual') sideW = smoothstep(1.2, -1.0, z);
    else if (side === 'buccal') sideW = smoothstep(-1.2, 1.0, z);
    const n = fbm3(x * 1.4, y * 1.4, z * 1.4, 3, seed);
    const th = thick * sideW * (0.55 + 0.9 * n) * (0.6 + 0.4 * smoothstep(top, cej, y));
    let d = t.base(x, y, z) - th;
    d = smax(d, y - top - 0.6 * n, 0.5);
    d = smax(d, bot - y, 0.5);
    return d;
  };
}

// Screw-type implant along the tooth axis (canonical tooth frame, y up = occlusal).
export function implantSDF(len = 11, radius = 2.05) {
  const pitch = 0.8;
  return (x, y, z) => {
    const r = Math.sqrt(x * x + z * z);
    const ang = Math.atan2(z, x) / (2 * Math.PI);
    // body: from platform (y = -0.6) down to apex (y = -len)
    const taper = smoothstep(-len + 3.5, -len, y);
    const R = radius * (1 - 0.32 * taper);
    let ph = (y / pitch + ang) % 1;
    if (ph < 0) ph += 1;
    const tri = Math.abs(ph - 0.5) * 2; // 0..1 triangle wave
    const thread = 0.32 * (1 - tri) * (1 - smoothstep(-1.5, -0.6, y));
    let body = r - (R - 0.3 + thread);
    body = smax(body, y + 0.6, 0.15);
    body = smax(body, -len - y, 0.8);
    // collar / platform
    let collar = r - radius * 1.02;
    collar = smax(collar, y + 0.0, 0.1);
    collar = smax(collar, -1.4 - y, 0.1);
    // abutment
    let abut = r - (1.75 - 0.18 * smoothstep(0, 4, y));
    abut = smax(abut, y - 4.2, 0.4);
    abut = smax(abut, -0.2 - y, 0.1);
    return Math.min(smin(body, collar, 0.2), abut);
  };
}

export function build(job) {
  if (job.kind === 'calculus') {
    const def = TOOTH_TYPES[job.code];
    const f = calculusSDF(job.code, job.amount, job.side, job.sub || 0, job.seed || 1);
    const t = intactTooth(job.code);
    const b = t.bounds;
    const cej = Math.max(def.cejM, def.cejD);
    const bounds = [b[0] - 0.5, -3 - (job.sub || 0), b[2] - 0.5, b[3] + 0.5, cej + 3.5, b[5] + 0.5];
    return meshSDF(colOf(f), bounds, 0.17, { evalFn: f, band: 3 });
  }
  if (job.kind === 'implant') {
    const f = implantSDF(job.len || 11, job.radius || 2.05);
    return meshSDF(colOf(f), [-3, -(job.len || 11) - 1, -3, 3, 5, 3], 0.12, { evalFn: f, band: 3 });
  }
  throw new Error('unknown extra ' + job.kind);
}
