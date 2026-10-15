// Запекает облегчённую версию процедурной 3D-челюсти (tools/jaw-anatomy) для сайта.
// Геометрия генерируется один раз здесь, упрощается и сжимается meshoptimizer'ом:
// в браузере нет ни SDF, ни воркеров — только загрузка готовых сеток.
//
//   npm run bake   →   src/jaw3d/data/jaw.bin + src/jaw3d/data/jaw.json
//
// Именованные якоря (anchors) — точки и параметры патологий в координатах зуба —
// используются сценариями в src/jaw3d/scenarios.js. Переименовали здесь — поправьте там.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { TOOTH_TYPES, buildTooth, cejHeight } from '../tools/jaw-anatomy/anatomy/teeth.js';
import * as jawGen from '../tools/jaw-anatomy/anatomy/jaw.js';
import { computeLayout, HINGE } from '../tools/jaw-anatomy/anatomy/layout.js';
import * as extras from '../tools/jaw-anatomy/anatomy/extras.js';
import { meshSDF } from '../tools/jaw-anatomy/core/surfaceNets.js';
import { smoothstep } from '../tools/jaw-anatomy/core/math.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/jaw3d/data');
const LAYOUT = computeLayout();
const colOf = (fn) => ({ column: (x, z) => (y) => fn(x, y, z) });
const defOf = (fdi) => LAYOUT.teeth[fdi].def;

// ---------------------------------------------------------------------------
// Генерация сеток (повторяет обработчики geom.worker.js исходного проекта)

function toothMesh(code, mods) {
  const def = TOOTH_TYPES[code];
  const intact = jawGen.intactTooth(code);
  const t = mods ? buildTooth(def, mods) : intact;
  const m = meshSDF(colOf(t.eval), t.bounds, 0.26, {
    evalFn: t.eval,
    band: 3,
    attrs: {
      aLayer: [
        2,
        (x, y, z, o) => {
          const above = y > cejHeight(def, x) - 0.2;
          o[0] = above ? smoothstep(0.12, -0.3, intact.dentin(x, y, z)) : 0;
          o[1] = smoothstep(0.15, -0.2, intact.pulp(x, y, z));
        },
      ],
    },
  });
  return { ...m, attrName: 'aLayer', attrScale: [1, 1] };
}

function pulpMesh(code) {
  const t = jawGen.intactTooth(code);
  return meshSDF(colOf(t.pulp), t.pulpBounds, 0.24, { evalFn: t.pulp, band: 3 });
}

// aGum.x — глубина под десневым краем (мм, до ~20), aGum.y — вес нёба (0..1)
const gumMesh = (jaw, params) => ({ ...jawGen.meshGum(jaw, params), attrName: 'aGum', attrScale: [24, 1] });
const boneMesh = (jaw, params) => jawGen.meshBone(jaw, params);

// ---------------------------------------------------------------------------
// Упрощение, квантование и сжатие

function simplify(mesh, ratio, error) {
  const vcount = mesh.positions.length / 3;
  let indices = Uint32Array.from(mesh.indices);
  const target = Math.floor((indices.length * ratio) / 3) * 3;
  [indices] = MeshoptSimplifier.simplify(indices, mesh.positions, 3, target, error, ['ErrorAbsolute']);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const positions = new Float32Array(unique * 3);
  const normals = new Float32Array(unique * 3);
  const attr = mesh.attrName ? new Float32Array(unique * 2) : null;
  const src = mesh.attrName ? mesh.attributes[mesh.attrName].array : null;
  for (let i = 0; i < Math.min(vcount, remap.length); i++) {
    const j = remap[i];
    if (j === 0xffffffff) continue;
    for (let k = 0; k < 3; k++) {
      positions[j * 3 + k] = mesh.positions[i * 3 + k];
      normals[j * 3 + k] = mesh.normals[i * 3 + k];
    }
    if (attr) {
      attr[j * 2] = src[i * 2];
      attr[j * 2 + 1] = src[i * 2 + 1];
    }
  }
  return { positions, normals, indices, attr, attrName: mesh.attrName, attrScale: mesh.attrScale };
}

const chunks = [];
let offset = 0;
function push(bytes) {
  const at = offset;
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  offset += bytes.byteLength;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    offset += pad;
  }
  return [at, bytes.byteLength];
}

// Три потока на сетку: позиции uint16 x,y,z,_ на сетке STEP мм | нормали oct8 (фильтр OCTAHEDRAL) | [uint8 a,b,_,_]
const STEP = 0.008;
function encode(name, m) {
  const n = m.positions.length / 3;
  const min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) min[k] = Math.min(min[k], m.positions[i * 3 + k]);
  const pos = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const q = Math.round((m.positions[i * 3 + k] - min[k]) / STEP);
      if (q > 65535) throw new Error(`${name}: mesh too large for STEP`);
      pos[i * 4 + k] = q;
    }
  }
  const nrm4 = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) nrm4[i * 4 + k] = m.normals[i * 3 + k];
  const entry = { vcount: n, min, step: STEP };
  entry.position = push(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(pos.buffer), n, 8));
  entry.normal = push(MeshoptEncoder.encodeVertexBuffer(MeshoptEncoder.encodeFilterOct(nrm4, n, 4, 8), n, 4));
  if (m.attr) {
    const a = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) a[i * 4 + k] = Math.round(Math.max(0, Math.min(1, m.attr[i * 2 + k] / m.attrScale[k])) * 255);
    }
    entry.attr = { name: m.attrName, scale: m.attrScale, range: push(MeshoptEncoder.encodeVertexBuffer(a, n, 4)) };
  }
  const isize = n < 65536 ? 2 : 4;
  const idx = isize === 2 ? Uint16Array.from(m.indices) : m.indices;
  entry.icount = idx.length;
  entry.isize = isize;
  entry.index = push(MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength), idx.length, isize));
  meshes[name] = entry;
  const kb = [entry.position, entry.normal, entry.index, entry.attr?.range].filter(Boolean).reduce((s, r) => s + r[1], 0) / 1024;
  console.log(`${name.padEnd(17)} ${String(idx.length / 3).padStart(7)} tris  ${kb.toFixed(0).padStart(5)} KB`);
}

// ---------------------------------------------------------------------------
// Якоря сценариев (по мотивам helpers из diseases/scenarios.js исходного проекта)

function surfacePoint(code, p, dir) {
  const t = jawGen.intactTooth(code);
  let [x, y, z] = p;
  for (let i = 0; i < 400; i++) {
    if (t.eval(x, y, z) > 0) break;
    x += dir[0] * 0.03;
    y += dir[1] * 0.03;
    z += dir[2] * 0.03;
  }
  return [x, y, z];
}

function cariesSite(fdi) {
  const d = defOf(fdi);
  if (d.kind === 'molar' || d.kind === 'premolar') return surfacePoint(d.code, [0.15, d.H * 0.35, 0.05], [0, 1, 0]);
  return surfacePoint(d.code, [-d.am * 0.55, d.H * 0.58, 0], [0, 0, 1]);
}

function cavity(fdi, k) {
  const d = defOf(fdi);
  const [x, y, z] = cariesSite(fdi);
  const scale = Math.min(1.15, (d.am + d.bm) / 9.5);
  const r = (0.7 + 1.9 * k) * scale;
  return { x, y: y + 0.45 - 0.75 * k * scale, z, r };
}

function lesion(fdi, k, amt) {
  const c = cavity(fdi, k);
  const [x, y, z] = cariesSite(fdi);
  return { x, y: y - 0.35 - 0.4 * k, z, r: c.r * 1.25 + 0.6, amt };
}

const fill = (fdi, k, grow) => {
  const c = cavity(fdi, k);
  return { ...c, r: c.r + grow, amt: 1 };
};

// Вершины межзубных сосочков (капли крови при кровоточивости)
function papilla(pairs) {
  return pairs.map(([fa, fb]) => {
    const a = LAYOUT.teeth[fa], b = LAYOUT.teeth[fb];
    const avg = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    const norm = (v) => {
      const l = Math.hypot(...v);
      return v.map((c) => c / l);
    };
    const mid = avg(a.O, b.O), Y = norm(avg(a.Y, b.Y)), Z = norm(avg(a.Z, b.Z));
    const h = (Math.max(a.def.cejM, b.def.cejM) + 0.9) * 0.9;
    const out = (a.def.bNeck + b.def.bNeck) / 2 + 0.6;
    return mid.map((c, k) => +(c + Y[k] * h + Z[k] * out).toFixed(3));
  });
}

function frontLowerCenter() {
  const a = LAYOUT.teeth[31].O, b = LAYOUT.teeth[41].O;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1, (a[2] + b[2]) / 2 + 2];
}

// ---------------------------------------------------------------------------

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const meshes = {};
const t0 = Date.now();

const codes = Object.keys(TOOTH_TYPES);
for (const code of codes) encode('tooth:' + code, simplify(toothMesh(code), 0.26, 0.014));
for (const code of codes) encode('pulp:' + code, simplify(pulpMesh(code), 0.35, 0.015));

// Варианты первого нижнего моляра (36 / 46 — один тип L6, зеркальные кадры)
encode('tooth:L6:cav45', simplify(toothMesh('L6', { cavities: [cavity(36, 0.45)] }), 0.35, 0.01));
encode('tooth:L6:cav95', simplify(toothMesh('L6', { cavities: [cavity(46, 0.95)] }), 0.35, 0.01));
encode('tooth:L6:crown', simplify(toothMesh('L6', { crownOnly: true }), 0.35, 0.01));

for (const jaw of ['U', 'L']) {
  encode('gum:' + jaw, simplify(gumMesh(jaw, {}), 0.18, 0.04));
  encode('bone:' + jaw, simplify(boneMesh(jaw, {}), 0.1, 0.08));
}
encode('gum:L:missing36', simplify(gumMesh('L', { missing: [36] }), 0.18, 0.04));
encode('bone:L:missing36', simplify(boneMesh('L', { missing: [36] }), 0.1, 0.08));

const implantLen = Math.min(11.5, defOf(36).L - 1);
encode('implant', simplify(extras.build({ kind: 'implant', len: implantLen }), 0.12, 0.01));

const DEF_KEYS = ['kind', 'H', 'L', 'am', 'bm', 'cejM', 'cejD', 'aNeck', 'bNeck'];
const defs = {};
for (const code of codes) {
  defs[code] = Object.fromEntries(DEF_KEYS.map((k) => [k, TOOTH_TYPES[code][k]]));
  for (const k of DEF_KEYS) if (defs[code][k] === undefined) throw new Error(`def ${code}.${k} is missing`);
}

const teeth = {};
for (const [fdi, f] of Object.entries(LAYOUT.teeth)) teeth[fdi] = { code: f.code, matrix: f.matrix.map((v) => +v.toFixed(5)) };

const anchors = {
  caries36: cariesSite(36),
  lesion36spot: lesion(36, 0.1, 0.28),
  lesion36cavity: lesion(36, 0.5, 0.85),
  fill36: fill(36, 0.9, 0.25),
  caries46: cariesSite(46),
  lesion46deep: lesion(46, 0.95, 1),
  fill46: fill(46, 0.95, 0.3),
  frontLowerCenter: frontLowerCenter(),
  papillaLower: papilla([[41, 31], [42, 41], [31, 32], [43, 42], [32, 33]]),
  nerveR: jawGen.NERVE_PATH_R,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'jaw.bin'), Buffer.concat(chunks));
writeFileSync(join(OUT, 'jaw.json'), JSON.stringify({ hinge: HINGE, implantLen, defs, teeth, anchors, meshes }));
console.log(`\njaw.bin ${(offset / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
