// Physically based materials with injected GLSL for dental tissues and pathology effects.
// Copied from the jaw project (src/render/materials.js); local addition: uShade on teeth (whitening scenario).
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
float jHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float jNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(jHash(i), jHash(i + vec3(1, 0, 0)), f.x), mix(jHash(i + vec3(0, 1, 0)), jHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(jHash(i + vec3(0, 0, 1)), jHash(i + vec3(1, 0, 1)), f.x), mix(jHash(i + vec3(0, 1, 1)), jHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float jFbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * jNoise(p); p *= 2.03; a *= 0.5; } return s; }
// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) in [-1, 1]; smooth gradients for bump mapping
vec3 jMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 jMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 jPermute(vec4 x) { return jMod289(((x * 34.0) + 10.0) * x); }
vec4 jTaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float jSimplex(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = jMod289(i);
  vec4 p = jPermute(jPermute(jPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = jTaylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// bump from a scalar height using screen-space derivatives
vec3 jBump(vec3 pos, vec3 n, float h, float scale) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h)) * scale;
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - g);
}
`;

// Ghost / x-ray look appended after lighting.
const XRAY_GLSL = /* glsl */ `
{
  float fres = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
  fres = pow(fres, uXrayPow);
  vec3 ghost = uXrayColor * (0.25 + 1.6 * fres);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(gl_FragColor.rgb * 0.6 + ghost * 0.6, ghost, uXrayGhost), uXray);
  gl_FragColor.a *= mix(1.0, clamp(uXrayOpacity * (uXrayBase + (1.0 - uXrayBase) * fres), 0.0, 1.0), uXray);
}
`;

function patchMaterial(material, cfg) {
  const u = cfg.uniforms;
  material.userData.u = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>\n${cfg.vertexPars || ''}`);
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${cfg.vertex || ''}`);
    fs = fs.replace('#include <common>', `#include <common>\n${NOISE_GLSL}\n${cfg.fragPars || ''}`);
    if (cfg.color) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${cfg.color}`);
    if (cfg.rough) fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${cfg.rough}`);
    if (cfg.normal) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${cfg.normal}`);
    if (cfg.physical) fs = fs.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${cfg.physical}`);
    if (cfg.emissive) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${cfg.emissive}`);
    fs = fs.replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${cfg.final || ''}\n${XRAY_GLSL}`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => cfg.key;
  return material;
}

const xrayUniforms = (color = 0x9fd3ff, opacity = 0.5, base = 0.12, ghost = 0.6, pow = 2.2) => ({
  uXray: { value: 0 },
  uXrayColor: { value: new THREE.Color(color) },
  uXrayOpacity: { value: opacity },
  uXrayBase: { value: base },
  uXrayGhost: { value: ghost },
  uXrayPow: { value: pow },
});

// ---------------------------------------------------------------------------
// Tooth

export function createToothMaterial(def) {
  const u = {
    ...xrayUniforms(0xcfe6ff, 0.55, 0.28, 0.35, 1.6),
    uH: { value: def.H },
    uCejM: { value: def.cejM },
    uCejD: { value: def.cejD },
    uANeck: { value: def.aNeck },
    uAnterior: { value: def.kind === 'incisor' ? 1 : def.kind === 'canine' ? 0.6 : 0.15 },
    uSeed: { value: Math.random() * 10 },
    uLesion: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
    uLesionAmt: { value: new THREE.Vector3(0, 0, 0) },
    uPlaque: { value: 0 },
    uFluor: { value: 0 },
    uFill: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFillAmt: { value: 0 },
    uGrey: { value: 0 },
    uStain: { value: 0 },
    uShade: { value: 0 },
    uHighlight: { value: 0 },
    uSelect: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xfff2dc),
    sheenRoughness: 0.6,
  });
  return patchMaterial(mat, {
    key: 'tooth-v2',
    uniforms: u,
    vertexPars: `attribute vec2 aLayer; varying vec3 vPos; varying vec2 vLayer;`,
    vertex: `vPos = position; vLayer = aLayer;`,
    fragPars: `
      varying vec3 vPos; varying vec2 vLayer;
      uniform float uH, uCejM, uCejD, uANeck, uAnterior, uSeed, uPlaque, uFluor, uFillAmt, uGrey, uStain, uShade, uHighlight, uSelect, uTime;
      uniform vec4 uLesion[3]; uniform vec3 uLesionAmt; uniform vec4 uFill;
      uniform float uXray, uXrayOpacity, uXrayBase, uXrayGhost, uXrayPow; uniform vec3 uXrayColor;
      float gCrown; float gRough; float gMatte; float gBump;
    `,
    color: `
      {
        vec3 p = vPos;
        float t = clamp(abs(p.x) / uANeck, 0.0, 1.0);
        float s = t * t * (3.0 - 2.0 * t);
        float cej = (p.x < 0.0 ? uCejM : uCejD) * s * s;
        gCrown = smoothstep(cej - 0.12, cej + 0.22, p.y);
        float n = jFbm(p * 1.6 + uSeed);
        float n2 = jNoise(p * 7.0 + uSeed);
        // enamel: warm cervical third, bright body, slightly grey-blue translucent incisal edge
        vec3 enamel = mix(vec3(0.84, 0.76, 0.58), vec3(0.93, 0.9, 0.82), smoothstep(cej, cej + uH * 0.55, p.y));
        enamel = mix(enamel, vec3(0.74, 0.78, 0.82), uAnterior * smoothstep(uH - 2.4, uH + 0.2, p.y) * 0.55);
        enamel *= 0.955 + 0.07 * n + 0.02 * n2;
        vec3 cementum = vec3(0.84, 0.72, 0.52) * (0.93 + 0.1 * n);
        vec3 col = mix(cementum, enamel, gCrown);
        gRough = mix(0.55, 0.2, gCrown);
        gMatte = 0.0;
        gBump = 0.0;
        // exposed dentin (wear, fracture, cavity walls) and pulp
        vec3 dentin = vec3(0.83, 0.68, 0.42) * (0.9 + 0.12 * n);
        col = mix(col, dentin, vLayer.x * gCrown);
        gRough = mix(gRough, 0.45, vLayer.x * gCrown);
        col = mix(col, vec3(0.62, 0.1, 0.1), vLayer.y);
        // extrinsic stain near the neck
        col = mix(col, col * vec3(0.78, 0.66, 0.48), uStain * (1.0 - smoothstep(cej + 0.5, cej + 3.5, p.y)) * gCrown * (0.6 + 0.4 * n));
        // overall enamel shade: > 0 yellowed, < 0 whitened
        if (uShade > 0.0) col = mix(col, col * vec3(0.93, 0.8, 0.58), uShade * gCrown);
        else col = mix(col, vec3(0.97, 0.965, 0.94) * (0.97 + 0.03 * n), -uShade * gCrown * 0.6);
        // fluorosis: opaque white flecks, then brown patches and pits
        if (uFluor > 0.0) {
          float band = 0.5 + 0.5 * sin(p.y * 4.2 + jFbm(p * 0.8) * 3.0);
          float w = smoothstep(0.5, 0.64, jFbm(p * vec3(0.7, 1.6, 0.7) + 3.0) * 0.8 + band * 0.2) * smoothstep(0.0, 0.3, uFluor);
          col = mix(col, vec3(0.99, 0.98, 0.95), w * gCrown * 0.9);
          float b = smoothstep(0.58, 0.7, jFbm(p * 0.55 + 11.0)) * smoothstep(0.35, 0.8, uFluor);
          col = mix(col, mix(vec3(0.66, 0.46, 0.22), vec3(0.48, 0.3, 0.13), smoothstep(0.62, 0.75, jFbm(p * 0.55 + 11.0))), b * gCrown);
          float pit = smoothstep(0.9, 0.95, jNoise(p * 2.2 + 5.0)) * smoothstep(0.75, 1.0, uFluor) * smoothstep(0.4, 0.7, b + w * 0.5);
          col = mix(col, vec3(0.32, 0.22, 0.12), pit * gCrown);
          gMatte += (w + b) * gCrown;
          gBump += pit * gCrown;
        }
        // soft plaque along the gingival third
        if (uPlaque > 0.0) {
          float pl = (1.0 - smoothstep(cej + 0.6, cej + 3.2 + n * 1.5, p.y)) * smoothstep(0.35, 0.55, n + 0.2 * uPlaque) * uPlaque;
          col = mix(col, vec3(0.86, 0.8, 0.55), pl * 0.85);
          gMatte += pl;
        }
        // carious lesions: chalky halo -> brown -> dark cavity
        for (int i = 0; i < 3; i++) {
          float a = uLesionAmt[i];
          if (a <= 0.0) continue;
          vec4 L = uLesion[i];
          float d = length(p - L.xyz) / max(L.w, 0.01) + (jFbm(p * 2.6 + float(i) * 3.0) - 0.5) * 0.5;
          float halo = (1.0 - smoothstep(0.85, 1.35, d)) * smoothstep(0.0, 0.25, a);
          col = mix(col, vec3(0.96, 0.95, 0.9), halo * 0.65);
          float brown = (1.0 - smoothstep(0.5, 1.0, d)) * smoothstep(0.12, 0.55, a);
          col = mix(col, vec3(0.45, 0.29, 0.13), brown);
          float core = (1.0 - smoothstep(0.0, 0.62, d)) * smoothstep(0.4, 1.0, a);
          col = mix(col, vec3(0.13, 0.08, 0.05), core);
          gMatte += halo + brown;
          gBump += brown * 0.6;
        }
        // composite restoration
        if (uFillAmt > 0.0) {
          float d = length(p - uFill.xyz) / max(uFill.w, 0.01);
          float f = (1.0 - smoothstep(0.9, 1.0, d)) * uFillAmt;
          col = mix(col, vec3(0.97, 0.95, 0.9), f * 0.8);
          float edge = smoothstep(0.82, 0.95, d) * (1.0 - smoothstep(0.95, 1.05, d)) * uFillAmt;
          col *= 1.0 - edge * 0.12;
        }
        // devital tooth greying
        col = mix(col, col * vec3(0.68, 0.66, 0.66) + vec3(0.03, 0.02, 0.04), uGrey * gCrown);
        diffuseColor.rgb = col;
      }
    `,
    rough: `roughnessFactor = clamp(mix(gRough, 0.85, clamp(gMatte, 0.0, 1.0)), 0.04, 1.0);`,
    normal: `
      {
        // subtle surface undulation + roughness of lesions / fluorotic pits
        // (masks scale the derivative, never the height, to avoid contour artefacts)
        normal = jBump(-vViewPosition, normal, jSimplex(vPos * 1.6), 0.0012);
        normal = jBump(-vViewPosition, normal, jSimplex(vPos * 5.0), 0.0002 + 0.02 * clamp(gBump, 0.0, 1.0));
      }
    `,
    physical: `material.clearcoat *= gCrown * (1.0 - clamp(gMatte, 0.0, 1.0));`,
    emissive: `
      {
        float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += vec3(0.25, 0.55, 1.0) * (uHighlight * (0.15 + 0.85 * fres)) * 0.7;
        totalEmissiveRadiance += vec3(0.25, 0.85, 0.8) * uSelect * pow(fres, 2.0) * (0.3 + 0.12 * sin(uTime * 3.0));
        // faint subsurface warmth
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.05, 0.04, 0.025) * gCrown;
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Pulp

export function createPulpMaterial() {
  const u = {
    ...xrayUniforms(0xff7777, 1, 1, 0, 2),
    uInflam: { value: 0 },
    uLevel: { value: 20 },
    uNecrosis: { value: 0 },
    uFilled: { value: 0 },
    uDim: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  return patchMaterial(mat, {
    key: 'pulp-v1',
    uniforms: u,
    vertexPars: `varying vec3 vPos;`,
    vertex: `vPos = position;`,
    fragPars: `varying vec3 vPos; uniform float uInflam, uLevel, uNecrosis, uFilled, uDim, uTime;
      uniform float uXray, uXrayOpacity, uXrayBase, uXrayGhost, uXrayPow; uniform vec3 uXrayColor; float gInf;`,
    color: `
      {
        float n = jFbm(vPos * 2.0);
        vec3 col = vec3(0.88, 0.5, 0.5) * (0.92 + 0.14 * n);
        // vessels
        float v = 1.0 - abs(jFbm(vPos * vec3(1.2, 0.5, 1.2)) * 2.0 - 1.0);
        col = mix(col, vec3(0.66, 0.2, 0.24), smoothstep(0.94, 0.985, v) * 0.35);
        gInf = uInflam * smoothstep(uLevel - 1.2, uLevel + 1.2, vPos.y);
        col = mix(col, vec3(0.95, 0.06, 0.05), gInf);
        col = mix(col, vec3(0.28, 0.24, 0.2) * (0.8 + 0.4 * n), uNecrosis);
        col = mix(col, vec3(0.93, 0.5, 0.22), uFilled);
        col = mix(col, vec3(0.78, 0.66, 0.68), uDim * (1.0 - gInf));
        diffuseColor.rgb = col;
      }
    `,
    emissive: `totalEmissiveRadiance += vec3(1.0, 0.1, 0.05) * gInf * (0.35 + 0.35 * sin(uTime * 5.0)) * (1.0 - uNecrosis) * (1.0 - uFilled);`,
  });
}

// ---------------------------------------------------------------------------
// Gingiva

export function createGumMaterial() {
  const u = {
    ...xrayUniforms(0xff9aa8, 0.42, 0.04, 0.85, 2.4),
    uInfl: { value: new THREE.Vector4(0, 0, 0, 1) },
    uInflAmt: { value: 0 },
    uInflAll: { value: 0 },
    uSwell: { value: new THREE.Vector4(0, 0, 0, 1) },
    uSwellAmt: { value: 0 },
    uSwellCore: { value: new THREE.Vector3() },
    uFistula: { value: new THREE.Vector4(0, 0, 0, 0) },
    uBleed: { value: 0 },
    uPale: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.42,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    sheen: 0.7,
    sheenColor: new THREE.Color(0xff8c8c),
    sheenRoughness: 0.45,
  });
  return patchMaterial(mat, {
    key: 'gum-v1',
    uniforms: u,
    vertexPars: `
      attribute vec2 aGum; varying vec3 vPos; varying vec2 vGum; varying float vInfl; varying float vSwell;
      uniform vec4 uInfl, uSwell; uniform vec3 uSwellCore; uniform float uInflAmt, uInflAll, uSwellAmt;
    `,
    vertex: `
      {
        vGum = aGum;
        float margin = 1.0 - smoothstep(0.3, 4.5, aGum.x);
        float region = max(uInflAll, 1.0 - smoothstep(uInfl.w * 0.55, uInfl.w, length(position - uInfl.xyz)));
        vInfl = region * uInflAmt;
        // abscess swelling: smooth radial bulge from a point inside the jaw, with analytic normal tilt
        vec3 dp = position - uSwell.xyz;
        float r2 = max(uSwell.w * uSwell.w, 0.01);
        float g = exp(-dot(dp, dp) / r2);
        float A = 2.4 * uSwellAmt;
        vSwell = g * uSwellAmt;
        vec3 dir = normalize(position - uSwellCore);
        transformed += dir * (A * g) + normal * (vInfl * margin * 0.3);
        if (A > 0.0) {
          vec3 grad = -2.0 * dp / r2 * g;
          vec3 nn = normalize(objectNormal - grad * A * 0.85);
          vNormal = normalize(normalMatrix * nn);
        }
        vPos = transformed;
      }
    `,
    fragPars: `
      varying vec3 vPos; varying vec2 vGum; varying float vInfl; varying float vSwell;
      uniform vec4 uFistula; uniform float uBleed, uPale, uTime;
      uniform float uXray, uXrayOpacity, uXrayBase, uXrayGhost, uXrayPow; uniform vec3 uXrayColor;
      float gStip; float gGloss;
    `,
    color: `
      {
        float depth = vGum.x;
        float pal = vGum.y;
        float n = jFbm(vPos * 0.9);
        vec3 attached = vec3(0.86, 0.47, 0.5);
        vec3 marginC = vec3(0.9, 0.56, 0.57);
        vec3 mucosa = vec3(0.72, 0.25, 0.3);
        vec3 col = mix(marginC, attached, smoothstep(0.4, 2.0, depth));
        col = mix(col, mucosa, smoothstep(6.5, 10.0, depth) * (1.0 - pal));
        col = mix(col, vec3(0.85, 0.52, 0.53), pal);
        col *= 0.93 + 0.12 * n;
        // superficial vessels in the alveolar mucosa
        float v = 1.0 - abs(jFbm(vPos * vec3(0.45, 0.9, 0.45) + 4.0) * 2.0 - 1.0);
        col = mix(col, vec3(0.62, 0.16, 0.22), smoothstep(0.955, 0.99, v) * smoothstep(7.0, 10.0, depth) * (1.0 - pal) * 0.3);
        gStip = smoothstep(1.0, 2.0, depth) * (1.0 - smoothstep(6.0, 8.0, depth)) * (1.0 - pal);
        // inflammation: red, glossy, swollen margin
        float margin = 1.0 - smoothstep(0.3, 5.0, depth);
        float inf = vInfl * (0.35 + 0.65 * margin);
        col = mix(col, vec3(0.72, 0.1, 0.13) * (0.9 + 0.2 * n), clamp(inf, 0.0, 1.0));
        gStip *= 1.0 - clamp(vInfl * 1.5, 0.0, 1.0);
        gGloss = clamp(inf, 0.0, 1.0);
        // abscess swelling + fistula
        col = mix(col, vec3(0.78, 0.18, 0.18), clamp(vSwell * 1.3, 0.0, 1.0));
        if (uFistula.w > 0.0) {
          float fd = length(vPos - uFistula.xyz);
          col = mix(col, vec3(0.98, 0.9, 0.55), (1.0 - smoothstep(0.35, 1.0, fd)) * uFistula.w);
          col = mix(col, vec3(0.75, 0.12, 0.12), smoothstep(0.8, 1.2, fd) * (1.0 - smoothstep(1.2, 2.2, fd)) * uFistula.w);
        }
        // bleeding spots at the papillae
        if (uBleed > 0.0) {
          float papilla = 1.0 - smoothstep(0.2, 1.6, vGum.x);
          float b = smoothstep(0.66, 0.78, jFbm(vPos * 0.8 + 2.0)) * papilla * vInfl;
          col = mix(col, vec3(0.48, 0.0, 0.03), clamp(b * uBleed * 1.2, 0.0, 0.85));
        }
        col = mix(col, col * vec3(1.05, 0.9, 0.9) + 0.05, uPale);
        diffuseColor.rgb = col;
      }
    `,
    rough: `roughnessFactor = mix(roughnessFactor, 0.2, gGloss);`,
    normal: `
      {
        normal = jBump(-vViewPosition, normal, jSimplex(vPos * 3.0), 0.009 * gStip);
        normal = jBump(-vViewPosition, normal, jSimplex(vPos * 0.9), 0.004);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Bone

export function createBoneMaterial() {
  const u = {
    ...xrayUniforms(0xd8ecff, 0.5, 0.05, 0.9, 2.0),
    uTime: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.72,
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xfff0d8),
  });
  return patchMaterial(mat, {
    key: 'bone-v1',
    uniforms: u,
    vertexPars: `varying vec3 vPos;`,
    vertex: `vPos = position;`,
    fragPars: `varying vec3 vPos; uniform float uTime;
      uniform float uXray, uXrayOpacity, uXrayBase, uXrayGhost, uXrayPow; uniform vec3 uXrayColor; float gPore;`,
    color: `
      {
        float n = jFbm(vPos * 0.35);
        float n2 = jFbm(vPos * 1.7 + 7.0);
        vec3 col = mix(vec3(0.77, 0.73, 0.64), vec3(0.88, 0.85, 0.78), n);
        col *= 0.95 + 0.07 * n2;
        gPore = smoothstep(0.7, 0.86, jNoise(vPos * 1.6));
        col *= 1.0 - gPore * 0.06;
        diffuseColor.rgb = col;
      }
    `,
    normal: `
      {
        normal = jBump(-vViewPosition, normal, jSimplex(vPos * 0.8) + 0.3 * jSimplex(vPos * 2.6), 0.01);
      }
    `,
  });
}

// Generic translucent glow material for lesions (abscess, granuloma, inflammation spheres).
export function createLesionMaterial(color = 0xd8b23a, emissive = 0x661100) {
  const u = { ...xrayUniforms(0xffd27a, 1, 1, 0, 2), uTime: { value: 0 }, uPulse: { value: 1 } };
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    emissive: new THREE.Color(emissive),
    emissiveIntensity: 0.6,
  });
  return patchMaterial(mat, {
    key: 'lesion-v1',
    uniforms: u,
    vertexPars: `varying vec3 vPos; uniform float uTime, uPulse;`,
    vertex: `vPos = position; transformed *= 1.0 + 0.05 * uPulse * sin(uTime * 4.0);`,
    fragPars: `varying vec3 vPos; uniform float uTime, uPulse;
      uniform float uXray, uXrayOpacity, uXrayBase, uXrayGhost, uXrayPow; uniform vec3 uXrayColor;`,
    color: `diffuseColor.rgb *= 0.85 + 0.3 * jFbm(vPos * 2.0);`,
    emissive: `totalEmissiveRadiance *= 0.7 + 0.3 * uPulse * sin(uTime * 4.0);`,
  });
}

export function setXray(material, amount) {
  const u = material.userData.u;
  if (!u) return;
  u.uXray.value = amount;
  const transparent = amount > 0.001;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.depthWrite = !transparent;
    material.needsUpdate = true;
  }
}
