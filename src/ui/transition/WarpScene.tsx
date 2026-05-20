// Warp demo three.js scene.
//
// Layers, bottom to top:
//   1. StarStreaks fullscreen plane (renderOrder -1000). Faded by
//      uIntensity per phase; only fully visible during 'queue'.
//   2. Debug helpers: AxesHelper + X/Y/Z sprite labels, camera-facing
//      GridHelper, inset bounds rectangle, small origin marker.
//   3. Phase group containing the turtle. Scale/position/rotation are
//      driven by per-phase behaviour each frame. Hidden until the gltf
//      has loaded; a wireframe icosahedron stands in as a "loading"
//      anchor and dims once the turtle is up.
//
// Coordinate convention mirrors TarobotScene (the main app's scene):
//   - OrthographicCamera at (0, 0, 100) looking down -Z
//   - +X right, +Y up, +Z toward camera
//   - World units == pixels

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { publishWarpStat, warpLog } from './warpLog';
import { createStarStreaks } from './StarStreaks';
import { createWarpTurtle } from './WarpTurtle';

export type WarpPhase =
  | 'pre' | 'summon' | 'lock' | 'warp' | 'disintegrate' | 'whiteout' | 'queue';

type Props = {
  phase: WarpPhase;
  phaseStartMs: number;
};

// World-unit sizes for debug helpers.
const AXES_SIZE = 80;
const GRID_SIZE = 600;
const GRID_DIVISIONS = 12;
const PLACEHOLDER_RADIUS = 16;
const BOUNDS_INSET = 6;
const AXIS_LABEL_PX = 28;

// Base size of the turtle on screen. Phase scaling multiplies on top.
const TURTLE_BASE_PX = 220;

// Per-phase behaviour for the turtle group. Returns scale/offset/spin.
type PhaseFrame = { scale: number; offX: number; offY: number; spin: number };
const PHASE_BEHAVIOR: Record<WarpPhase, (t: number) => PhaseFrame> = {
  pre: (t) => ({ scale: 1.0, offX: 0, offY: 0, spin: Math.sin(t * 0.4) * 0.05 }),
  summon: (t) => {
    const u = clamp(t / 2.0, 0, 1);
    const e = 1 - Math.pow(1 - u, 3);
    return {
      scale: lerp(0.4, 1.3, e),
      offX: lerp(-360, 0, e),
      offY: 0,
      spin: Math.sin(t * 1.2) * 0.08,
    };
  },
  lock: () => ({ scale: 1.3, offX: 0, offY: 0, spin: 0 }),
  warp: (t) => ({
    scale: 1.3 + Math.sin(t * 9) * 0.12,
    offX: 0, offY: 0,
    spin: t * 2.0,
  }),
  disintegrate: (t) => {
    const u = clamp(t / 2.0, 0, 1);
    return { scale: lerp(1.3, 0, u), offX: 0, offY: 0, spin: t * 0.8 };
  },
  whiteout: () => ({ scale: 0, offX: 0, offY: 0, spin: 0 }),
  queue: () => ({ scale: 0, offX: 0, offY: 0, spin: 0 }),
};

// Per-phase star streak intensity. Queue is the only phase that turns
// them all the way up, per the spec.
const PHASE_STREAK_INTENSITY: Record<WarpPhase, number> = {
  pre: 0, summon: 0, lock: 0, warp: 0, disintegrate: 0, whiteout: 0, queue: 1.0,
};

function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function makeLabelSprite(text: string, hex: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#' + hex.toString(16).padStart(6, '0');
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillText(text, 32, 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(AXIS_LABEL_PX, AXIS_LABEL_PX, 1);
  return s;
}

export function WarpScene({ phase, phaseStartMs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const phaseStartRef = useRef(phaseStartMs);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { phaseStartRef.current = phaseStartMs; }, [phaseStartMs]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);

    // ── Star streaks (renders behind everything) ─────────
    const streaks = createStarStreaks();
    streaks.attachUnderscene(camera.position.z);
    scene.add(streaks.mesh);

    function sizeRig(): void {
      const w = container?.clientWidth ?? window.innerWidth;
      const h = container?.clientHeight ?? window.innerHeight;
      renderer.setSize(w, h, false);
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
      streaks.resize(w, h);
      publishWarpStat('viewport', `${w}×${h}`);
    }

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    sizeRig();

    // ── Debug scaffolding ────────────────────────────────
    const axes = new THREE.AxesHelper(AXES_SIZE);
    scene.add(axes);

    const labelX = makeLabelSprite('X', 0xff4444); labelX.position.set(AXES_SIZE + 14, 0, 0);
    const labelY = makeLabelSprite('Y', 0x44ff44); labelY.position.set(0, AXES_SIZE + 14, 0);
    const labelZ = makeLabelSprite('Z', 0x4488ff); labelZ.position.set(0, 0, AXES_SIZE + 14);
    scene.add(labelX, labelY, labelZ);

    const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x335577, 0x223344);
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    scene.add(grid);

    const boundsMat = new THREE.LineBasicMaterial({
      color: 0xff3366, transparent: true, opacity: 0.6,
    });
    const boundsGeom = new THREE.BufferGeometry();
    const bounds = new THREE.LineLoop(boundsGeom, boundsMat);
    scene.add(bounds);
    function updateBounds(): void {
      const w = camera.right - camera.left;
      const h = camera.top - camera.bottom;
      const ix = w / 2 - BOUNDS_INSET;
      const iy = h / 2 - BOUNDS_INSET;
      const verts = new Float32Array([
        -ix,  iy, 0,
         ix,  iy, 0,
         ix, -iy, 0,
        -ix, -iy, 0,
      ]);
      boundsGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      boundsGeom.computeBoundingSphere();
    }
    updateBounds();

    // Origin marker — small wireframe icosahedron. Acts as "loading"
    // placeholder until the turtle gltf resolves; dims once the
    // turtle is up so it remains a faint origin reference, not a
    // distraction.
    const placeholderGeom = new THREE.IcosahedronGeometry(PLACEHOLDER_RADIUS, 1);
    const placeholderMat = new THREE.MeshBasicMaterial({
      color: 0x6dff8a,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
    scene.add(placeholder);

    // ── Turtle (async load) ──────────────────────────────
    const phaseGroup = new THREE.Group();
    phaseGroup.visible = false; // hidden until turtle is ready
    scene.add(phaseGroup);

    const turtle = createWarpTurtle();
    phaseGroup.add(turtle.group);

    turtle.ready
      .then(() => {
        if (!mounted) return;
        phaseGroup.visible = true;
        // Dim the placeholder to a faint origin reference.
        placeholderMat.opacity = 0.18;
        warpLog('turtle ready');
      })
      .catch((err) => warpLog(`turtle load FAILED: ${err?.message ?? err}`));

    function onResize(): void { sizeRig(); updateBounds(); }
    window.addEventListener('resize', onResize);

    warpLog(`WarpScene mounted: viewport ${container.clientWidth}×${container.clientHeight}`);

    // ── Render loop ──────────────────────────────────────
    let raf = 0;
    let frames = 0;
    let lastTick = performance.now();
    let lastFrameT = performance.now();
    const startT = performance.now();

    function animate(): void {
      if (!mounted) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastFrameT) / 1000, 0.05);
      lastFrameT = now;
      const t = (now - startT) / 1000;
      const phaseElapsed = (now - phaseStartRef.current) / 1000;
      const ph = phaseRef.current;

      // Star streaks: time always advances; intensity per phase.
      streaks.update(t);
      streaks.setIntensity(PHASE_STREAK_INTENSITY[ph]);

      // Turtle: swim cycle + body shader time always advance.
      turtle.update(dt, t);

      // Phase-driven transforms on the turtle's parent group.
      const frame = PHASE_BEHAVIOR[ph](Math.max(0, phaseElapsed));
      const s = TURTLE_BASE_PX * frame.scale;
      phaseGroup.scale.set(s, s, s);
      phaseGroup.position.set(frame.offX, frame.offY, 0);
      phaseGroup.rotation.z = frame.spin * 0.1;
      phaseGroup.rotation.y = frame.spin;

      // Placeholder spins gently regardless of phase.
      placeholder.rotation.x += dt * 0.6;
      placeholder.rotation.y += dt * 0.8;

      renderer.render(scene, camera);

      frames += 1;
      if (now - lastTick >= 500) {
        const fps = (frames * 1000) / (now - lastTick);
        publishWarpStat('fps', Math.round(fps));
        publishWarpStat('cam', `(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`);
        publishWarpStat('scene.objs', scene.children.length);
        publishWarpStat('turtle.s', `${s.toFixed(0)}px`);
        publishWarpStat('streaks.i', PHASE_STREAK_INTENSITY[ph].toFixed(2));
        frames = 0;
        lastTick = now;
      }
    }
    animate();

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      placeholderGeom.dispose();
      placeholderMat.dispose();
      boundsGeom.dispose();
      boundsMat.dispose();
      axes.dispose?.();
      grid.dispose?.();
      [labelX, labelY, labelZ].forEach((sp) => {
        sp.material.map?.dispose();
        sp.material.dispose();
      });
      turtle.dispose();
      streaks.dispose();
      renderer.dispose();
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
      warpLog('WarpScene unmounted');
    };
  }, []);

  return <div ref={containerRef} className="warp-scene" />;
}
