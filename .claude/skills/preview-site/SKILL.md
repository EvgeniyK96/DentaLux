---
name: preview-site
description: Launch the ДентаЛюкс site and check a change visually with the Playwright MCP browser — desktop and mobile screenshots, the 3D jaw block, the booking modal, horizontal overflow and console errors. Use after any UI, CSS, content or 3D change, or when asked to run, screenshot or verify the site.
---

# Preview and verify the site

## Start

```bash
npm run dev -- --strictPort        # http://127.0.0.1:5174 (run in background)
npm run build && npx vite preview --port 4174 --strictPort --host 127.0.0.1   # production check
```

Stop servers when done (`pkill -f "vite"`).

## Playwright gotchas (learned the hard way)

- Screenshots must be saved under `.playwright-mcp/` (gitignored); other paths are rejected.
- **Changing only the hash does not reload.** `navigate` to `/#treatment` from `/` keeps the old JS (and an old `JawScene` instance survives HMR). Use `location.reload()` via `browser_evaluate`, or add a dummy query (`/?v=2`).
- **Viewport screenshots can show a stale frame while CSS animations run** (the preloader often looks blank or half-drawn). To inspect an animation frame, freeze it first:
  `document.getAnimations().forEach(a => { a.pause(); a.currentTime = 1950; })`, then screenshot.
- Sections reveal on scroll (`whileInView`), so a full-page screenshot shows empty areas. Scroll to each section (`scrollTo` + ~1.4 s wait) and take viewport screenshots.
- The preloader stays for ≥1.9 s; wait ~3.5 s after load before checking the hero.

## 3D block

- In dev, `window.__jaw` is the live `JawScene` (set in `src/jaw3d/JawCanvas.jsx`). Wait for it after scrolling to `#treatment`.
- Jump to a scenario stage and freeze the camera sway before a screenshot:

```js
async (sid, i) => {
  document.getElementById('jaw-tab-' + sid).click();
  await new Promise(r => setTimeout(r, 100));
  document.querySelectorAll('.jaw__step')[i].click();          // switches to manual mode
  await new Promise(r => setTimeout(r, 2300));                // camera flight is 1.7 s
  window.__jaw.sway = 0; window.__jaw.swayTarget = 0;
}
```

- Screenshot only the stage: `target: ".jaw__stage"`.
- Headless Chromium renders WebGL in software and reports 2 cores, so `JawScene` takes the low-power path (no shadows, DPR 1.25). FPS numbers there are far below a real GPU; X-ray fades cause 100–200 ms frames in software only.
- Verify laziness: on first load, `performance.getEntriesByType('resource')` must contain only the main `index-*.js`/`.css` — no `JawCanvas-*.js`, `three`, or `jaw-*.bin` until the user scrolls near the block.

## Checklist

1. Desktop 1440×900 and mobile 390×844 (`browser_resize`).
2. No horizontal overflow: `document.documentElement.scrollWidth === document.documentElement.clientWidth`. If it fails, list elements whose `getBoundingClientRect().right` exceeds the width (grid children need `min-width: 0`; flex columns inherit `align-items` from wider breakpoints).
3. Booking modal: opens from header/hero/3D CTA with the right preselected service, focus lands in «Имя», Esc closes and restores scroll, validation messages appear, phone mask gives `+7 (701) 123-45-67` for `87011234567`, `7011234567`, `+77011234567`.
4. `browser_console_messages` with level `warning` is empty.
5. `npm run lint` and `npm run build` pass.
