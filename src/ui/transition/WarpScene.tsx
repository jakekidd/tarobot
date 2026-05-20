// Bare three.js skeleton for the warp demo. Built debug-first.
//
// Coordinate convention mirrors TarobotScene (the main app's scene):
//   - OrthographicCamera at (0, 0, 100) looking down -Z
//   - +X right, +Y up, +Z toward camera
//   - Visible viewport in world units = window pixels
//
// What's drawn from day one:
//   - AxesHelper at origin (red=+X, green=+Y, blue=+Z) with sprite
//     labels at each axis tip so RGB↔XYZ is unambiguous.
//   - GridHelper rotated to face the camera (xy plane) so it reads as
//     a grid, not as a single edge-on line.
//   - Inset LineLoop showing the camera frustum bounds (red).
//   - Wireframe icosahedron as the turtle placeholder.
//
// Phase-aware behavior: the parent passes `phase` + `phaseStartMs`,
// and the placeholder scale/position/spin update per frame from a
// per-phase behavior table. This is intentionally chunky — each phase
// looks distinctly different so the demo can validate phase plumbing
// before the real scene lands.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { publishWarpStat, warpLog } from './warpLog';

export type WarpPhase =
  | 'pre' | 'summon' | 'lock' | 'warp' | 'disintegrate' | 'whiteout' | 'queue';

type Props = {
  phase: WarpPhase;
  phaseStartMs: number;
};

// World-unit sizes for debug helpers. Tuned so they read without
// dominating once real effects layer in.
const AXES_SIZE = 80;
const GRID_SIZE = 600;
const GRID_DIVISIONS = 12;
const PLACEHOLDER_RADIUS = 30;
const BOUNDS_INSET = 6; // px from each edge — keeps the line visible
const AXIS_LABEL_PX = 28;

// ── Per-phase placeholder behavior ─────────────────────────
// Each fn takes phase-elapsed seconds and returns scale/offset/spin.
// Returning scale=0 hides it (useful for whiteout / queue).
type PhaseFrame = { scale: number; offX: number; offY: number; spin: number };
const PHASE_BEHAVIOR: Record<WarpPhase, (t: number) => PhaseFrame> = {
  // Gentle: slow spin, sits at base scale.
  pre: (t) => ({ scale: 1.0, offX: 0, offY: 0, spin: t * 0.3 }),
  // "Summoned in" — from off-screen left + small, eased to center + big.
  summon: (t) => {
    const u = clamp(t / 2.0, 0, 1);
    const ease = 1 - Math.pow(1 - u, 3); // easeOutCubic
    return {
      scale: lerp(0.4, 1.6, ease),
      offX: lerp(-360, 0, ease),
      offY: 0,
      spin: t * 0.8,
    };
  },
  // Brief stillness at center — a beat of recognition before warp.
  lock: () => ({ scale: 1.6, offX: 0, offY: 0, spin: 0 }),
  // Warp: rapid pulse + fast spin.
  warp: (t) => ({
    scale: 1.6 + Math.sin(t * 9) * 0.18,
    offX: 0, offY: 0,
    spin: t * 3.5,
  }),
  // Shrink to zero over the phase, slow spin.
  disintegrate: (t) => {
    const u = clamp(t / 2.0, 0, 1);
    return { scale: lerp(1.6, 0, u), offX: 0, offY: 0, spin: t * 0.8 };
  },
  // Hidden under the white flash overlay.
  whiteout: () => ({ scale: 0, offX: 0, offY: 0, spin: 0 }),
  // Tiny remnant for the queue card era.
  queue: (t) => ({ scale: 0.35, offX: 0, offY: -60, spin: t * 0.15 }),
};

function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Build a sprite from a canvas drawing — used for axis labels. */
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
  // Refs so the animate loop reads the latest phase + phaseStartMs
  // without re-mounting the scene every state change.
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

    function sizeRig(): void {
      const w = container?.clientWidth ?? window.innerWidth;
      const h = container?.clientHeight ?? window.innerHeight;
      renderer.setSize(w, h, false);
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
      publishWarpStat('viewport', `${w}×${h}`);
    }

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    sizeRig();

    // ── Debug scaffolding ────────────────────────────────
    // Axes at origin.
    const axes = new THREE.AxesHelper(AXES_SIZE);
    scene.add(axes);

    // Sprite labels at axis tips.
    const labelX = makeLabelSprite('X', 0xff4444); labelX.position.set(AXES_SIZE + 14, 0, 0);
    const labelY = makeLabelSprite('Y', 0x44ff44); labelY.position.set(0, AXES_SIZE + 14, 0);
    const labelZ = makeLabelSprite('Z', 0x4488ff); labelZ.position.set(0, 0, AXES_SIZE + 14);
    scene.add(labelX, labelY, labelZ);

    // Grid rotated to face the camera (xy plane). Edge-on grids look
    // like a single line; this reads as a proper checkerboard.
    const grid = new THREE.GridHelper(
      GRID_SIZE, GRID_DIVISIONS,
      0x335577, 0x223344,
    );
    grid.rotation.x = Math.PI / 2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    // Inset bounds rectangle — shows the camera frustum. Inset by a
    // few px so the line isn't clipped at the screen edge.
    const boundsMat = new THREE.LineBasicMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0.6,
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

    // Placeholder — wireframe icosahedron at origin. Phase behavior
    // drives its scale/position/rotation each frame.
    const placeholderGeom = new THREE.IcosahedronGeometry(PLACEHOLDER_RADIUS, 1);
    const placeholderMat = new THREE.MeshBasicMaterial({
      color: 0x6dff8a,
      wireframe: true,
    });
    const placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
    scene.add(placeholder);

    function onResize(): void {
      sizeRig();
      updateBounds();
    }
    window.addEventListener('resize', onResize);

    warpLog(`WarpScene mounted: viewport ${container.clientWidth}×${container.clientHeight}`);

    // ── Render loop ──────────────────────────────────────
    let raf = 0;
    let frames = 0;
    let lastTick = performance.now();

    function animate(): void {
      if (!mounted) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const phaseElapsed = (now - phaseStartRef.current) / 1000;

      // Drive the placeholder from per-phase behavior.
      const frame = PHASE_BEHAVIOR[phaseRef.current](Math.max(0, phaseElapsed));
      placeholder.scale.setScalar(frame.scale);
      placeholder.position.set(frame.offX, frame.offY, 0);
      placeholder.rotation.x = frame.spin * 0.7;
      placeholder.rotation.y = frame.spin;

      renderer.render(scene, camera);

      // Stats — fps every 0.5s, plus live placeholder world position.
      frames += 1;
      if (now - lastTick >= 500) {
        const fps = (frames * 1000) / (now - lastTick);
        publishWarpStat('fps', Math.round(fps));
        publishWarpStat('cam', `(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`);
        publishWarpStat('scene.objs', scene.children.length);
        publishWarpStat('placeholder', `s=${frame.scale.toFixed(2)} x=${frame.offX.toFixed(0)} y=${frame.offY.toFixed(0)}`);
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
      [labelX, labelY, labelZ].forEach((s) => {
        s.material.map?.dispose();
        s.material.dispose();
      });
      renderer.dispose();
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
      warpLog('WarpScene unmounted');
    };
  }, []);

  return <div ref={containerRef} className="warp-scene" />;
}
