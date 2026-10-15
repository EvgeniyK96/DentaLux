---
name: jaw-scenario
description: Add or change a scenario/stage of the 3D jaw block («Как мы лечим — в 3D») — texts, camera views, pathology states, labels — and re-bake geometry when a stage needs a new tooth or jaw variant. Use for any request about the 3D model, its scenarios, or `npm run bake`.
---

# 3D jaw scenarios

The site shows a **pre-baked, lightweight** copy of the procedural atlas from `/home/evgeniy/СайтыФриланс/jaw`. Nothing is generated in the browser: geometry comes from `src/jaw3d/data/jaw.bin` + `jaw.json`, produced by `scripts/bake-jaw.mjs` from the SDF modules copied into `tools/jaw-anatomy/`.

## Where things live

| What | File |
|---|---|
| Scenario list, stage texts, states, views, labels | `src/jaw3d/scenarios.js` |
| Which meshes/variants and anchor points exist | `scripts/bake-jaw.mjs` → `jaw.json` (`meshes`, `anchors`, `defs`, `teeth`) |
| How a state is applied, camera presets, extras | `src/jaw3d/JawScene.js` |
| Shaders (lesions, plaque, stain, `uShade`, x-ray) | `src/jaw3d/materials.js` (copied from jaw; `uShade` is local) |
| UI (topics, steps, autoplay) | `src/components/JawSection.jsx` |

## Stage anatomy

```js
{
  title: 'Полость в дентине',
  text: '…patient-facing Russian text…',
  build: (A, D) => {                     // A = jaw.json anchors, D = tooth defs by code (D.L6.L …)
    const s = lowerMolar(36);            // helpers at the top of scenarios.js
    T(s, 36).lesions = [A.lesion36cavity];
    T(s, 36).variant = 'cav45';          // needs mesh "tooth:L6:cav45" in jaw.json
    return s;
  },
  view: { cam: 'occlusal', fdi: 36, dist: 78 },
  labels: [{ fdi: 36, local: 'caries36', text: 'Кариозная полость' }],
}
```

State keys understood by `JawScene.applyState`: `mouth` (0–1), `view` (`normal`|`xray`), `hideJaw` (`U`|`L`), `focus` (FDI, teal glow), `showNerve`, `jawVariant: { L: 'missing36' }`, `gumFx: { infl: {jaw, center, radius, amt}, inflAll, bleed }`, `extras: [{ id, type: 'implant'|'pain'|'drops'|'nerve', fdi?, amount? }]`, and per tooth `T(s, fdi)`: `missing`, `variant`, `lesions[≤3]`, `fill`, `plaque`, `stain`, `grey`, `shade` (−1 whitened … 1 yellowed), `glow`, `wobble`, `pulp: { inflam, level, necrosis, filled }`, `showPulp`.

Camera `view.cam`: `overview`, `side` (whole model), `front` (smile view; `dist`, `y`), `occlusal` / `buccal` (need `view.fdi`). Presets are tuned for the site's canvas aspect in `JawScene.viewFor`/`cameraFor`; there is no user orbit — the camera flies and sways on its own.

Labels: `{ fdi, local: [x,y,z] | '<anchorName>', text }` in canonical tooth coordinates, or `{ jaw: 'U'|'L', world: [x,y,z] }`. They appear after the camera arrives.

## Adding something that needs new geometry

Teeth 36/46 share type `L6` (mirrored frames), so one variant serves both sides. If a stage needs a variant or anchor that is not in `jaw.json`:

1. In `scripts/bake-jaw.mjs` add an `encode('tooth:<code>:<variant>', simplify(toothMesh(code, mods), 0.35, 0.01))` line (or `gum:`/`bone:` with jaw params), and/or a new entry in `anchors` using the helpers there (`cariesSite`, `cavity`, `lesion`, `fill`, `papilla`). Mods and params follow the jaw project (`cavities`, `chip`, `wear`, `crownOnly`; `missing`, `impacted`, `recession`, `boneLoss`).
2. `npm run bake` (~10 s). It prints per-mesh triangle counts and the total size — keep `jaw.bin` under ~1 MB; the whole file is downloaded when the block comes into view.
3. Reference the new name from `scenarios.js`. A missing variant silently falls back to the intact mesh, so check it visually (see the `preview-site` skill).

Updating the anatomy itself means re-copying `src/anatomy/*` and `src/core/{math,surfaceNets}.js` from the jaw project into `tools/jaw-anatomy/` and re-baking. Shader changes go into `src/jaw3d/materials.js` — bump its `key:` (e.g. `tooth-v2` → `tooth-v3`) so three.js recompiles.

## Performance rules

- Keep three.js inside the lazy chunk: only `src/jaw3d/JawCanvas.jsx` (via `React.lazy`) may import `JawScene`, `loadJawData` or `three`. `scenarios.js` must stay three-free — it is in the main bundle.
- New extras or materials must be created once in `JawScene.warmup()` probes too, otherwise their first use compiles shaders mid-flight.
- Rendering stops when the block is off screen (`setActive`); don't add work outside `_frame`.
