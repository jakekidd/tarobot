// The floating 3D clat — for fun.
//
// A standalone transparent three.js canvas hosting the cat mascot (whose
// engine id is, fittingly, 'clat'). Not the full TarobotScene — just a
// camera, the mascot group, and a render loop. He drifts from the cursor
// and, while `thinking`, his eyes spin (the mascot's built-in `dizzy`
// reaction). pointer-events are off so he never eats a click.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createMascot } from '../../ui/scene/mascots';

const SIZE = 168;

export function ClatCanvas({ thinking }: { thinking: boolean }) {
  const hostRef = useRef<HTMLCanvasElement>(null);
  const thinkingRef = useRef(thinking);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(SIZE, SIZE, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 2.6);

    const mascot = createMascot('cat');
    scene.add(mascot.group);

    // Cursor tracking in screen space → normalized cat-relative vector.
    const mouse = { x: 0, y: 0, has: false };
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; };
    window.addEventListener('mousemove', onMove);

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dxPx = mouse.x - cx;
      const dyPx = mouse.y - cy;
      const dist = Math.hypot(dxPx, dyPx);
      const close = mouse.has && dist < rect.width * 1.6;
      mascot.update({
        dt,
        t: (now - t0) / 1000,
        mouse: {
          dx: dxPx / (rect.width / 2 || 1),
          dy: -dyPx / (rect.height / 2 || 1),
          close,
          intensity: close ? Math.max(0, 1 - dist / (rect.width * 1.6)) : 0,
        },
        dizzy: thinkingRef.current,
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      mascot.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={hostRef} className="pst-clat3d" width={SIZE} height={SIZE} aria-hidden />;
}
