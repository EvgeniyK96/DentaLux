// Облегчённая 3D-сцена челюсти для сайта клиники.
// Модель, материалы и пресеты камеры — по мотивам JawModel/Stage из проекта jaw, но:
// готовые сетки вместо генерации, без постобработки (GTAO), без OrbitControls и выбора зуба.
// Камера сама облетает модель при смене стадии и слегка покачивается, пока сцена в кадре.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createToothMaterial, createPulpMaterial, createGumMaterial, createBoneMaterial } from './materials.js';

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const JAWS = ['U', 'L'];
const jawOf = (fdi) => (Math.floor(fdi / 10) <= 2 ? 'U' : 'L');
const UP = new THREE.Vector3(0, 1, 0);

// Держит флаги прозрачности материала в соответствии с рентгеном и затуханием.
function syncMaterial(mat, xray, opacity) {
  const u = mat.userData.u;
  if (u) u.uXray.value = xray;
  mat.opacity = opacity;
  const transparent = xray > 0.002 || opacity < 0.998;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.depthWrite = !transparent;
    mat.needsUpdate = true;
  }
}

class Tooth {
  constructor(model, fdi, info) {
    const { data } = model;
    this.model = model;
    this.fdi = fdi;
    this.code = info.code;
    this.def = data.defs[info.code];
    this.jaw = jawOf(fdi);
    this.frame = new THREE.Matrix4().fromArray(info.matrix);
    // group — с анимацией удаления/подвижности; frameGroup — чистый кадр зуба (имплант, подписи)
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.frameGroup = new THREE.Group();
    this.frameGroup.matrixAutoUpdate = false;
    this.frameGroup.matrix.copy(this.frame);
    this.material = createToothMaterial(this.def);
    this.pulpMaterial = createPulpMaterial();
    this.intact = data.geometries['tooth:' + this.code];
    this.mesh = new THREE.Mesh(this.intact, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.pulp = new THREE.Mesh(data.geometries['pulp:' + this.code], this.pulpMaterial);
    this.pulp.visible = false;
    this.pulp.renderOrder = -1;
    this.group.add(this.mesh, this.pulp);
    this.cur = { vis: 1, extrude: 0, wobble: 0, xray: 0, hl: 0, sel: 0, plaque: 0, stain: 0, grey: 0, shade: 0, fill: 0,
      l0: 0, l1: 0, l2: 0, inflam: 0, level: 30, necrosis: 0, filled: 0, pulpVis: 0, dim: 0 };
    this.tgt = { ...this.cur };
    this.wobblePhase = Math.random() * 6;
    this._m = new THREE.Matrix4();
    this._l = new THREE.Matrix4();
    this._r = new THREE.Matrix4();
  }

  setVariant(name) {
    this.mesh.geometry = (name && this.model.data.geometries[`tooth:${this.code}:${name}`]) || this.intact;
  }

  update(dt, time) {
    const c = this.cur, t = this.tgt;
    for (const k in t) c[k] = damp(c[k], t[k], k === 'level' ? 1.6 : 3.2, dt);
    this._m.copy(this.frame);
    if (c.extrude > 0.001 || c.wobble > 0.001) {
      const piv = -0.45 * this.def.L;
      const a = c.wobble * Math.sin(time * 9 + this.wobblePhase) * 0.07;
      const b = c.wobble * Math.sin(time * 6.3 + this.wobblePhase * 1.7) * 0.05;
      this._l.makeTranslation(0, piv + c.extrude, 0);
      this._l.multiply(this._r.makeRotationZ(a));
      this._l.multiply(this._r.makeRotationX(b));
      this._l.multiply(this._r.makeTranslation(0, -piv, 0));
      this._m.multiply(this._l);
    }
    this.group.matrix.copy(this._m);
    this.group.matrixWorldNeedsUpdate = true;

    const u = this.material.userData.u;
    u.uHighlight.value = c.hl;
    u.uSelect.value = c.sel;
    u.uPlaque.value = c.plaque;
    u.uStain.value = c.stain;
    u.uGrey.value = c.grey;
    u.uShade.value = c.shade;
    u.uFillAmt.value = c.fill;
    u.uLesionAmt.value.set(c.l0, c.l1, c.l2);
    u.uTime.value = time;
    const vis = c.vis * this.model.jawFade[this.jaw];
    this.group.visible = vis > 0.01;
    syncMaterial(this.material, c.xray, vis);
    const pu = this.pulpMaterial.userData.u;
    pu.uInflam.value = c.inflam;
    pu.uLevel.value = c.level;
    pu.uNecrosis.value = c.necrosis;
    pu.uFilled.value = c.filled;
    pu.uDim.value = c.dim;
    pu.uTime.value = time;
    this.pulp.visible = c.pulpVis > 0.02 && vis > 0.05;
    syncMaterial(this.pulpMaterial, 0, Math.min(1, c.pulpVis) * vis);
  }
}

// ---------------------------------------------------------------------------

export class JawScene {
  constructor(container, overlay, data) {
    this.container = container;
    this.overlay = overlay;
    this.data = data;
    const lowPower = window.matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 1.5));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = !lowPower;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.prepend(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.5;

    this.camera = new THREE.PerspectiveCamera(30, 1, 5, 3000);
    this._buildLights();
    this._buildModel();

    this.camPos = new THREE.Vector3(-130, 35, 215);
    this.camTarget = new THREE.Vector3(-10, -2, -30);
    this._tween = null;
    this.sway = 0;
    this.swayTarget = 0;
    this._offset = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.labels = [];
    this.labelsShown = false;

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this._frame = this._frame.bind(this);
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
  }

  _buildLights() {
    // мягкий ключевой с тенью, холодный заполняющий, тёплый контровой; свет привязан к камере
    const hemi = new THREE.HemisphereLight(0xfff4ea, 0x302a2e, 0.32);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1e2, 1.75);
    key.position.set(-70, 110, 140);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 450;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.35;
    key.shadow.radius = 3;
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.5);
    fill.position.set(120, 20, 90);
    const rim = new THREE.DirectionalLight(0xffe2cf, 0.9);
    rim.position.set(30, 60, -160);
    const under = new THREE.DirectionalLight(0xffd9d2, 0.22);
    under.position.set(0, -120, 60);
    this.lightRig = new THREE.Group();
    for (const l of [key, fill, rim, under]) this.lightRig.add(l, l.target);
    this.scene.add(this.lightRig);
  }

  _buildModel() {
    const { data } = this;
    const geos = data.geometries;
    this.root = new THREE.Group();
    this.upper = new THREE.Group();
    this.lowerPivot = new THREE.Group();
    this.lowerPivot.position.set(0, data.hinge.y, data.hinge.z);
    this.lower = new THREE.Group();
    this.lower.position.set(0, -data.hinge.y, -data.hinge.z);
    this.lowerPivot.add(this.lower);
    this.root.add(this.upper, this.lowerPivot);
    this.scene.add(this.root);
    this.jawGroup = { U: this.upper, L: this.lower };

    this.teeth = new Map();
    for (const [f, info] of Object.entries(data.teeth)) {
      const t = new Tooth(this, +f, info);
      this.teeth.set(t.fdi, t);
      this.jawGroup[t.jaw].add(t.group, t.frameGroup);
    }
    this.gumMat = { U: createGumMaterial(), L: createGumMaterial() };
    this.boneMat = { U: createBoneMaterial(), L: createBoneMaterial() };
    this.gum = {};
    this.bone = {};
    for (const jaw of JAWS) {
      const gum = new THREE.Mesh(geos['gum:' + jaw], this.gumMat[jaw]);
      gum.renderOrder = 2;
      const bone = new THREE.Mesh(geos['bone:' + jaw], this.boneMat[jaw]);
      bone.renderOrder = 1;
      for (const m of [gum, bone]) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      this.gum[jaw] = gum;
      this.bone[jaw] = bone;
      this.jawGroup[jaw].add(gum, bone);
    }
    this.jawFade = { U: 1, L: 1 };
    this.cur = { mouth: 0, xray: 0, gumX: 0, boneX: 0, inflAmt: 0, inflAll: 0, bleed: 0, nerve: 0, fadeU: 1, fadeL: 1 };
    this.tgt = { ...this.cur };
    this.state = null;
    this.extras = new Map();
  }

  // ---- декларативное состояние (подмножество формата jaw) ----
  applyState(state) {
    this.state = state;
    const geos = this.data.geometries;
    const st = state.teeth || {};
    const view = state.view || 'normal';
    for (const t of this.teeth.values()) {
      const ts = st[t.fdi] || {};
      const g = t.tgt;
      g.vis = ts.missing ? 0 : 1;
      g.extrude = ts.missing ? 14 : 0;
      g.wobble = ts.wobble || 0;
      g.plaque = ts.plaque || 0;
      g.stain = ts.stain || 0;
      g.grey = ts.grey || 0;
      g.shade = ts.shade || 0;
      g.hl = ts.glow || 0;
      const L = ts.lesions || [];
      const lu = t.material.userData.u.uLesion.value;
      for (let i = 0; i < 3; i++) {
        const l = L[i];
        if (l) lu[i].set(l.x, l.y, l.z, l.r);
        g['l' + i] = l ? l.amt : 0;
      }
      if (ts.fill) t.material.userData.u.uFill.value.set(ts.fill.x, ts.fill.y, ts.fill.z, ts.fill.r);
      g.fill = ts.fill ? ts.fill.amt : 0;
      const pu = ts.pulp || {};
      g.inflam = pu.inflam || 0;
      g.level = pu.level ?? 30;
      g.necrosis = pu.necrosis || 0;
      g.filled = pu.filled || 0;
      g.xray = view === 'xray' ? 1 : 0;
      g.pulpVis = view === 'xray' || ts.showPulp ? 1 : 0;
      g.sel = state.focus === t.fdi ? 1 : 0;
      g.dim = state.focus && state.focus !== t.fdi && !ts.pulp ? 0.75 : 0;
      t.setVariant(ts.variant);
    }
    for (const jaw of JAWS) {
      const v = state.jawVariant && state.jawVariant[jaw];
      this.gum[jaw].geometry = (v && geos[`gum:${jaw}:${v}`]) || geos['gum:' + jaw];
      this.bone[jaw].geometry = (v && geos[`bone:${jaw}:${v}`]) || geos['bone:' + jaw];
    }
    const fx = state.gumFx || {};
    const c = this.tgt;
    c.inflAmt = fx.infl ? fx.infl.amt : 0;
    c.inflAll = fx.inflAll || 0;
    c.bleed = fx.bleed || 0;
    this._gumFx = fx;
    c.mouth = state.mouth || 0;
    c.gumX = view === 'normal' ? 0 : 1;
    c.boneX = view === 'normal' ? 0 : 1;
    c.nerve = view === 'xray' && state.showNerve ? 1 : 0;
    c.fadeU = state.hideJaw === 'U' ? 0 : 1;
    c.fadeL = state.hideJaw === 'L' ? 0 : 1;
    this._reconcileExtras(state.extras || []);
  }

  // ---- дополнительные объекты: имплант, боль, капли крови, нерв ----
  _reconcileExtras(list) {
    const seen = new Set();
    for (const spec of list) {
      seen.add(spec.id);
      let e = this.extras.get(spec.id);
      if (!e) {
        e = this._createExtra(spec);
        if (!e) continue;
        this.extras.set(spec.id, e);
      }
      e.spec = spec;
      e.target = spec.amount ?? 1;
    }
    for (const [id, e] of this.extras) if (!seen.has(id)) e.target = 0;
  }

  _createExtra(spec) {
    const e = { spec, value: 0, target: 1, obj: new THREE.Group(), materials: [], geometries: [] };
    const tooth = spec.fdi ? this.teeth.get(spec.fdi) : null;
    switch (spec.type) {
      case 'implant': {
        const mat = new THREE.MeshPhysicalMaterial({ color: 0xb9bec6, metalness: 1, roughness: 0.32, clearcoat: 0.3 });
        e.materials.push(mat);
        const m = new THREE.Mesh(this.data.geometries.implant, mat);
        m.castShadow = true;
        e.obj.add(m);
        tooth.frameGroup.add(e.obj);
        e.update = (s, v) => {
          e.obj.position.y = (1 - v) * 16;
          mat.opacity = Math.min(1, v * 1.5);
          mat.transparent = v < 0.99;
          e.obj.visible = v > 0.01;
        };
        break;
      }
      case 'nerve': {
        const mat = new THREE.MeshPhysicalMaterial({ color: 0xffd34a, emissive: 0x7a5200, emissiveIntensity: 0.6, roughness: 0.4, transparent: true, depthWrite: false });
        e.materials.push(mat);
        for (const side of [-1, 1]) {
          const pts = this.data.anchors.nerveR.map((p) => new THREE.Vector3(side < 0 ? p[0] : -p[0], p[1], p[2]));
          const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 1.05, 10, false);
          e.geometries.push(geo);
          e.obj.add(new THREE.Mesh(geo, mat));
        }
        this.lower.add(e.obj);
        e.update = (s, v) => {
          mat.opacity = v * this.cur.nerve;
          e.obj.visible = mat.opacity > 0.01;
        };
        break;
      }
      case 'drops': {
        const mat = new THREE.MeshPhysicalMaterial({ color: 0x8a0008, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
        const geo = new THREE.SphereGeometry(1, 16, 12);
        e.materials.push(mat);
        e.geometries.push(geo);
        for (const p of this.data.anchors.papillaLower) {
          const m = new THREE.Mesh(geo, mat);
          m.position.fromArray(p);
          m.userData.base = 0.35 + Math.random() * 0.35;
          m.userData.delay = Math.random();
          e.obj.add(m);
        }
        this.lower.add(e.obj);
        e.update = (s, v) => {
          for (const m of e.obj.children) {
            const k = THREE.MathUtils.clamp(v * 1.6 - m.userData.delay * 0.6, 0, 1);
            m.scale.set(m.userData.base * k, m.userData.base * k * 1.25, m.userData.base * k);
          }
          e.obj.visible = v > 0.01;
        };
        break;
      }
      case 'pain': {
        const geo = new THREE.RingGeometry(0.92, 1.0, 64);
        e.geometries.push(geo);
        for (let i = 0; i < 3; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
          e.materials.push(mat);
          const m = new THREE.Mesh(geo, mat);
          m.userData.phase = i / 3;
          e.obj.add(m);
        }
        this.root.add(e.obj);
        const center = new THREE.Vector3();
        e.update = (s, v, time) => {
          center.set(0, tooth.def.H * 0.45, 0).applyMatrix4(tooth.group.matrixWorld);
          e.obj.position.copy(center);
          e.obj.quaternion.copy(this.camera.quaternion);
          for (const m of e.obj.children) {
            const ph = (time * 0.7 + m.userData.phase) % 1;
            m.scale.setScalar(4 + ph * 6.5);
            m.material.opacity = v * (1 - ph) * (1 - ph) * 0.55;
          }
          e.obj.visible = v > 0.01 && tooth.group.visible;
        };
        break;
      }
      default:
        return null;
    }
    return e;
  }

  _disposeExtra(e) {
    e.obj.parent && e.obj.parent.remove(e.obj);
    for (const m of e.materials) m.dispose();
    for (const g of e.geometries) g.dispose();
  }

  // ---- камера ----
  // Мировая матрица зуба в целевой позе (с учётом конечного открывания рта)
  targetMatrix(fdi) {
    const t = this.teeth.get(fdi);
    const m = t.frame.clone();
    if (t.jaw === 'L') {
      const a = this.tgt.mouth, H = this.data.hinge;
      const jaw = new THREE.Matrix4()
        .makeTranslation(0, H.y - a * 1.2, H.z + a * 3.0)
        .multiply(new THREE.Matrix4().makeRotationX(a * 0.4))
        .multiply(new THREE.Matrix4().makeTranslation(0, -H.y, -H.z));
      m.premultiply(jaw);
    }
    this.root.updateWorldMatrix(true, false);
    return m.premultiply(this.root.matrixWorld);
  }

  toothAxes(fdi) {
    const e = this.targetMatrix(fdi).elements;
    return {
      X: new THREE.Vector3(e[0], e[1], e[2]).normalize(),
      Y: new THREE.Vector3(e[4], e[5], e[6]).normalize(),
      Z: new THREE.Vector3(e[8], e[9], e[10]).normalize(),
      O: new THREE.Vector3(e[12], e[13], e[14]),
    };
  }

  viewFor(v) {
    if (!v.fdi) {
      // цель, направление на камеру и расстояние; цели подобраны так, чтобы челюсть с ветвями
      // стояла по центру кадра (ветвь при взгляде слева-спереди уходит в левую часть кадра)
      const presets = {
        overview: [[-10, -2, -30], [-128, 38, 226], 262],
        side: [[2, -10, -22], [-235, 16, 32], 280],
      };
      const [t, dir, dist] = presets[v.dir] || presets.overview;
      const target = new THREE.Vector3(...t);
      return { position: target.clone().add(new THREE.Vector3(...dir).setLength((v.dist || dist) * (v.fit || 1))), target };
    }
    const ax = this.toothAxes(v.fdi);
    const H = this.teeth.get(v.fdi).def.H;
    const target = ax.O.clone().addScaledVector(ax.Y, v.y ?? H * 0.35);
    const mesial = ax.X.clone().negate();
    const out = new THREE.Vector3();
    if (v.dir === 'occlusal') out.copy(ax.Y).multiplyScalar(0.9).addScaledVector(ax.Z, 0.35).addScaledVector(mesial, 0.15);
    else out.copy(ax.Z).addScaledVector(ax.Y, 0.22).addScaledVector(mesial, 0.2); // buccal
    out.normalize();
    return { position: target.clone().addScaledVector(out, v.dist || 62), target };
  }

  cameraFor(view) {
    const v = view || {};
    // на узких экранах отодвигаем камеру, чтобы модель целиком помещалась
    const fit = this.camera.aspect < 1.1 ? 1.25 : 1;
    if (v.cam === 'front') {
      const d = (v.dist || 110) * 1.45 * fit;
      const target = new THREE.Vector3(0, v.y ?? -3, 12);
      return { position: target.clone().add(new THREE.Vector3(v.x || 0, v.lift ?? -4, d)), target };
    }
    if (v.fdi) return this.viewFor({ fdi: v.fdi, dir: v.cam, dist: (v.dist || 62) * 1.2 * fit, y: v.y });
    return this.viewFor({ dir: v.cam || 'overview', dist: v.dist, fit });
  }

  flyTo(position, target, duration = 1.6) {
    if (duration <= 0) {
      this.camPos.copy(position);
      this.camTarget.copy(target);
      this._tween = null;
      return;
    }
    this._tween = { p0: this.camPos.clone(), t0: this.camTarget.clone(), p1: position.clone(), t1: target.clone(), time: 0, duration };
  }

  // ---- подписи (HTML поверх канваса) ----
  setLabels(list) {
    for (const l of this.labels) {
      l.anchor.parent && l.anchor.parent.remove(l.anchor);
      l.el.remove();
    }
    this.labels = [];
    this.labelsShown = false;
    for (const spec of list) {
      const anchor = new THREE.Object3D();
      if (spec.fdi) {
        const local = typeof spec.local === 'string' ? this.data.anchors[spec.local] : spec.local;
        anchor.position.fromArray(local || [0, 0, 0]);
        this.teeth.get(spec.fdi).frameGroup.add(anchor);
      } else {
        anchor.position.fromArray(spec.world);
        this.jawGroup[spec.jaw || 'U'].add(anchor);
      }
      const el = document.createElement('div');
      el.className = 'jaw-label';
      el.innerHTML = '<span class="jaw-label__dot"></span><span class="jaw-label__text"></span>';
      el.lastChild.textContent = spec.text;
      this.overlay.appendChild(el);
      this.labels.push({ anchor, el });
    }
  }

  _updateLabels() {
    if (!this.labels.length) return;
    const show = !this._tween;
    if (show !== this.labelsShown) {
      this.labelsShown = show;
      for (const l of this.labels) l.el.classList.toggle('is-visible', show);
    }
    if (!show) return;
    const w = this._w, h = this._h;
    for (const l of this.labels) {
      l.anchor.getWorldPosition(this._v).project(this.camera);
      const behind = this._v.z > 1;
      l.el.style.transform = `translate(${((this._v.x + 1) / 2) * w}px, ${((1 - this._v.y) / 2) * h}px)`;
      l.el.style.visibility = behind ? 'hidden' : '';
    }
  }

  // ---- API для React ----
  setStage(stage, { immediate = false } = {}) {
    this.applyState(stage.build(this.data.anchors, this.data.defs));
    this.view = stage.view;
    const cam = this.cameraFor(stage.view);
    this.flyTo(cam.position, cam.target, immediate ? 0 : 1.7);
    this.setLabels(stage.labels || []);
    this.swayTarget = stage.view.cam === 'overview' || stage.view.cam === 'side' ? 0.3 : 0.06;
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.renderer.setAnimationLoop(on ? this._frame : null);
  }

  // Готовит GPU заранее, чтобы смена сценариев не подтормаживала посреди облёта камеры:
  // компилирует шейдеры в обоих вариантах (непрозрачный и прозрачный — для рентгена),
  // шейдеры объектов-дополнений и загружает в видеопамять все варианты геометрии.
  async warmup() {
    const used = new Set();
    this.scene.traverse((o) => o.isMesh && used.add(o.geometry));
    const probe = new THREE.Group();
    const probeMat = this.teeth.get(11).material;
    for (const g of Object.values(this.data.geometries)) if (!used.has(g)) probe.add(new THREE.Mesh(g, probeMat));
    // материалы проб не освобождаем: dispose() выгрузил бы и скомпилированные программы
    this._probes = ['implant', 'nerve', 'drops', 'pain'].map((type) => this._createExtra({ id: 'probe', type, fdi: type === 'implant' ? 36 : 46 }));
    this.scene.add(probe);
    const hidden = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const mats = new Set();
    this.scene.traverse((o) => o.material && mats.add(o.material));
    const flip = () => {
      for (const m of mats) {
        m.transparent = !m.transparent;
        m.needsUpdate = true;
      }
    };
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      flip();
      await this.renderer.compileAsync(this.scene, this.camera);
      flip();
      this.renderer.render(this.scene, this.camera); // заливка буферов геометрии
    } finally {
      for (const o of hidden) o.visible = false;
      this.scene.remove(probe);
      for (const e of this._probes) {
        e.obj.parent && e.obj.parent.remove(e.obj);
        for (const g of e.geometries) g.dispose();
      }
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h || (this._w === w && this._h === h)) return;
    this._w = w;
    this._h = h;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 40 : 30;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.view) {
      const cam = this.cameraFor(this.view);
      this.flyTo(cam.position, cam.target, 0);
    }
    if (!this.active) this._render();
  }

  _frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const time = this.timer.getElapsed();
    if (this._tween) {
      // путь по дуге вокруг цели — переход выглядит как облёт модели
      const tw = this._tween;
      tw.time += dt;
      const k = ease(Math.min(1, tw.time / tw.duration));
      const a = tw.p0.clone().sub(tw.t0), b = tw.p1.clone().sub(tw.t1);
      const la = a.length(), lb = b.length();
      const dir = a.normalize().lerp(b.normalize(), k).normalize();
      this.camTarget.copy(tw.t0).lerp(tw.t1, k);
      this.camPos.copy(this.camTarget).addScaledVector(dir, la + (lb - la) * k);
      if (k >= 1) this._tween = null;
    }
    this.sway = damp(this.sway, this.swayTarget, 1.2, dt);
    this._update(dt, time);
    this._render(Math.sin(time * 0.32) * this.sway);
    this._updateLabels();
  }

  _render(swayAngle = 0) {
    this._offset.copy(this.camPos).sub(this.camTarget).applyQuaternion(this._q.setFromAxisAngle(UP, swayAngle));
    this.camera.position.copy(this.camTarget).add(this._offset);
    this.camera.lookAt(this.camTarget);
    this.lightRig.quaternion.copy(this.camera.quaternion);
    this.lightRig.position.copy(this.camTarget);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt, time) {
    const c = this.cur, t = this.tgt;
    for (const k in t) c[k] = damp(c[k], t[k], 3.0, dt);
    c.xray = c.gumX;
    this.jawFade.U = c.fadeU;
    this.jawFade.L = c.fadeL;
    // открывание рта: поворот вокруг оси мыщелков с небольшим сдвигом вперёд
    const H = this.data.hinge, m = c.mouth;
    this.lowerPivot.rotation.x = m * 0.4;
    this.lowerPivot.position.set(0, H.y - m * 1.2, H.z + m * 3.0);
    for (const tooth of this.teeth.values()) tooth.update(dt, time);
    const fx = this._gumFx || {};
    for (const jaw of JAWS) {
      const fade = this.jawFade[jaw];
      syncMaterial(this.gumMat[jaw], c.gumX, fade);
      syncMaterial(this.boneMat[jaw], c.boneX, fade);
      this.gum[jaw].visible = fade > 0.01;
      this.bone[jaw].visible = fade > 0.01;
      const u = this.gumMat[jaw].userData.u;
      u.uTime.value = time;
      if (fx.infl && fx.infl.center) u.uInfl.value.set(...fx.infl.center, fx.infl.radius || 12);
      u.uInflAmt.value = fx.infl && fx.infl.jaw && fx.infl.jaw !== jaw ? 0 : Math.max(c.inflAmt, c.inflAll);
      u.uInflAll.value = c.inflAll > 0.001 ? 1 : 0;
      u.uBleed.value = c.bleed;
    }
    for (const [id, e] of this.extras) {
      e.value = damp(e.value, e.target, 2.6, dt);
      e.update(e.spec, e.value, time);
      if (e.target === 0 && e.value < 0.01) {
        this._disposeExtra(e);
        this.extras.delete(id);
      }
    }
  }

  dispose() {
    this.setActive(false);
    this._resizeObserver.disconnect();
    this.timer.dispose();
    this.setLabels([]);
    for (const e of this.extras.values()) this._disposeExtra(e);
    for (const e of this._probes || []) for (const m of e.materials) m.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    for (const g of Object.values(this.data.geometries)) g.dispose();
    this.envTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
