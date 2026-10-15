// Загрузка запечённой челюсти (scripts/bake-jaw.mjs): один бинарник + манифест → BufferGeometry.
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import manifest from './data/jaw.json';
import binUrl from './data/jaw.bin?url';

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить 3D-модель (${res.status})`);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress?.(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function decodeMesh(src, m) {
  const n = m.vcount;
  const slice = ([offset, length]) => src.subarray(offset, offset + length);

  const q = new Uint16Array(n * 4);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(q.buffer), n, 8, slice(m.position));
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = m.min[k] + q[i * 4 + k] * m.step;
  }

  const oct = new Int8Array(n * 4);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(oct.buffer), n, 4, slice(m.normal), 'OCTAHEDRAL');
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) normals[i * 3 + k] = oct[i * 4 + k] / 127;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  if (m.attr) {
    const a = new Uint8Array(n * 4);
    MeshoptDecoder.decodeVertexBuffer(a, n, 4, slice(m.attr.range));
    const values = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      values[i * 2] = (a[i * 4] / 255) * m.attr.scale[0];
      values[i * 2 + 1] = (a[i * 4 + 1] / 255) * m.attr.scale[1];
    }
    g.setAttribute(m.attr.name, new THREE.BufferAttribute(values, 2));
  }

  const index = m.isize === 2 ? new Uint16Array(m.icount) : new Uint32Array(m.icount);
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(index.buffer), m.icount, m.isize, slice(m.index));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

export async function loadJawData(onProgress) {
  const [bytes] = await Promise.all([fetchBytes(binUrl, onProgress), MeshoptDecoder.ready]);
  const geometries = {};
  for (const [name, m] of Object.entries(manifest.meshes)) geometries[name] = decodeMesh(bytes, m);
  return { ...manifest, geometries };
}
