// Точка входа ленивого чанка с three.js: грузится, только когда блок 3D подъезжает к экрану.
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { loadJawData } from './loadJawData.js';
import { JawScene } from './JawScene.js';

let dataPromise = null;

export default function JawCanvas({ scenario, stageIndex, active, onProgress, onReady, onError }) {
  const hostRef = useRef(null);
  const overlayRef = useRef(null);
  const [scene, setScene] = useState(null);
  const progress = useEffectEvent((p) => onProgress?.(p));
  const ready = useEffectEvent(() => onReady?.());
  const fail = useEffectEvent((err) => onError?.(err));

  useEffect(() => {
    let cancelled = false;
    let instance = null;
    dataPromise ??= loadJawData((p) => progress(p));
    dataPromise
      .then(async (data) => {
        if (cancelled) return;
        instance = new JawScene(hostRef.current, overlayRef.current, data);
        await instance.warmup();
        if (cancelled) return;
        setScene(instance);
        if (import.meta.env.DEV) window.__jaw = instance; // отладка из консоли/Playwright
        ready();
      })
      .catch((err) => {
        dataPromise = null;
        if (!cancelled) fail(err);
      });
    return () => {
      cancelled = true;
      instance?.dispose();
    };
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (!scene) return;
    scene.setStage(scenario.stages[stageIndex], { immediate: first.current });
    first.current = false;
  }, [scene, scenario, stageIndex]);

  useEffect(() => {
    scene?.setActive(active);
  }, [scene, active]);

  return (
    <div className="jaw-canvas" ref={hostRef}>
      <div className="jaw-canvas__labels" ref={overlayRef} aria-hidden="true" />
    </div>
  );
}
