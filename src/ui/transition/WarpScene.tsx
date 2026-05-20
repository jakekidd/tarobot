// Warp demo three.js scene.
//
// Phase semantics (per the latest redirect — we're INSIDE the tunnel
// during warp, not flying toward one):
//
//   pre           Turtle hovers at center. No streaks. A quiet beat.
//   summon        Streaks ramp in (we're being pulled into the tunnel).
//                 Turtle stays roughly put — no dramatic fly-in.
//   lock          Brief settle, streaks near peak.
//   warp          We're IN the tunnel. Streaks high. TurtlePilot drives
//                 the turtle through a perch state machine + critically
//                 damped springs. Click anywhere → kick (flip/spin),
//                 wobble back via the rotation spring. This phase will
//                 host the dialogue + text-entry UI in Pass 2.
//   disintegrate  Turtle shrinks (Pass 3: replace with particle dust).
//                 Streaks stay on at lower intensity (still in tunnel).
//   whiteout      DOM flash overlay covers everything; streaks off.
//   queue         Streaks at full intensity behind the queue card.
//
// Layers, bottom to top:
//   1. StarStreaks fullscreen plane (renderOrder -1000). Driven by a
//      smoothly-lerped intensity toward a per-phase target.
//   2. Debug helpers: AxesHelper + X/Y/Z sprite labels, camera-facing
//      GridHelper, inset bounds rectangle, dim origin marker.
//   3. phaseGroup containing the turtle. During warp, position +
//      rotation come from the TurtlePilot; otherwise from the simpler
//      PHASE_BEHAVIOR table.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { publishWarpStat, warpLog } from './warpLog';
import { createStarStreaks } from './StarStreaks';
import { createWarpTurtle } from './WarpTurtle';
import { createTurtlePilot } from './TurtlePilot';

export type WarpPhase =
  | 'pre' | 'summon' | 'lock' | 'warp' | 'disintegrate' | 'whiteout' | 'queue';

type Props = {
  phase: WarpPhase;
  phaseStartMs: number;
};

const AXES_SIZE = 80;
const GRID_SIZE = 600;
const GRID_DIVISIONS = 12;
const PLACEHOLDER_RADIUS = 16;
const BOUNDS_INSET = 6;
const AXIS_LABEL_PX = 28;

const TURTLE_BASE_PX = 240;

// Per-phase scale for the turtle, used by phases OTHER than warp. Warp
// uses TurtlePilot for full pose control. Scale here is in
// TURTLE_BASE_PX-multiples.
const PHASE_SCALE: Record<WarpPhase, number> = {
  pre: 1.0,
  summon: 1.0,    // no dramatic grow-in any more — he's just there
  lock: 1.0,
  warp: 1.0,      // pilot owns transform; this is the base size multiplier
  disintegrate: 1.0,
  whiteout: 0,
  queue: 0,
};

// Per-phase target intensity for the star streaks. Smoothly lerped.
const PHASE_STREAK_TARGET: Record<WarpPhase, number> = {
  pre: 0,
  summon: 0.55,
  lock: 0.75,
  warp: 0.85,
  disintegrate: 0.5,
  whiteout: 0,
  queue: 1.0,
};

// Disintegrate stub — scale collapse for now (Pass 3 replaces this
// with a particle dust system). 0..1 over the phase.
function disintegrateScale(phaseT: number): number {
  const u = Math.max(0, Math.min(phaseT / 1.8, 1));
  return 1 - u;
}

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
    (grid.material as THREE.Material).opacity = 0.18;
    scene.add(grid);

    const boundsMat = new THREE.LineBasicMaterial({
      color: 0xff3366, transparent: true, opacity: 0.5,
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

    const placeholderGeom = new THREE.IcosahedronGeometry(PLACEHOLDER_RADIUS, 1);
    const placeholderMat = new THREE.MeshBasicMaterial({
      color: 0x6dff8a, wireframe: true, transparent: true, opacity: 0.9,
    });
    const placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
    scene.add(placeholder);

    // ── Turtle + pilot ───────────────────────────────────
    const phaseGroup = new THREE.Group();
    phaseGroup.visible = false;
    scene.add(phaseGroup);

    const turtle = createWarpTurtle();
    phaseGroup.add(turtle.group);

    const pilot = createTurtlePilot();

    turtle.ready
      .then(() => {
        if (!mounted) return;
        phaseGroup.visible = true;
        placeholderMat.opacity = 0.15;
        warpLog('turtle ready');
      })
      .catch((err) => warpLog(`turtle load FAILED: ${err?.message ?? err}`));

    function onResize(): void { sizeRig(); updateBounds(); }
    window.addEventListener('resize', onResize);

    // Click → pilot kick. Only meaningful during warp; other phases
    // ignore the impulse since pilot doesn't drive them.
    function onClick(e: MouseEvent): void {
      // Ignore clicks on the EXIT button / HUD chrome — those bubble.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON') return;
      if (phaseRef.current === 'warp') {
        pilot.kick('random');
      }
    }
    canvas.addEventListener('click', onClick);

    warpLog(`WarpScene mounted: viewport ${container.clientWidth}×${container.clientHeight}`);

    // ── Render loop ──────────────────────────────────────
    let raf = 0;
    let frames = 0;
    let lastTick = performance.now();
    let lastFrameT = performance.now();
    const startT = performance.now();
    let streakI = 0; // smoothed intensity for the streak shader

    function animate(): void {
      if (!mounted) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastFrameT) / 1000, 0.05);
      lastFrameT = now;
      const t = (now - startT) / 1000;
      const phaseElapsed = (now - phaseStartRef.current) / 1000;
      const ph = phaseRef.current;

      // ── Star streaks ──
      streaks.update(t);
      const target = PHASE_STREAK_TARGET[ph];
      // First-order smoothing; ~120ms time-constant feels right.
      streakI += (target - streakI) * Math.min(dt * 8, 1);
      streaks.setIntensity(streakI);

      // ── Turtle (always tick swim cycle + shader time) ──
      turtle.update(dt, t);

      // ── Per-phase turtle transform ──
      const viewportW = camera.right - camera.left;
      const viewportH = camera.top - camera.bottom;
      let phaseScale = PHASE_SCALE[ph];

      if (ph === 'warp') {
        pilot.update(dt, t, viewportW, viewportH);
        phaseGroup.position.copy(pilot.pos);
        // Pilot.rot is layered ON TOP of the turtle's baked face-camera
        // rotation. We apply it to phaseGroup so the click wobble
        // recovers naturally back to identity.
        phaseGroup.rotation.set(pilot.rot.x, pilot.rot.y, pilot.rot.z);
        turtle.setAnimationSpeed(pilot.animTimeScale());
      } else {
        // Non-warp phases: simple centered hover. No flying-in motion.
        if (ph === 'disintegrate') phaseScale = disintegrateScale(phaseElapsed);
        phaseGroup.position.set(0, 0, 0);
        // Very small idle yaw so he's not statue-still during pre/summon/lock.
        phaseGroup.rotation.set(0, Math.sin(t * 0.4) * 0.04, 0);
        turtle.setAnimationSpeed(0.25);
        // If we just left warp, reset the pilot so re-entry is clean.
        if (pilot.vel.lengthSq() > 0 || pilot.pos.lengthSq() > 0) {
          pilot.reset();
        }
      }
      const s = TURTLE_BASE_PX * phaseScale;
      phaseGroup.scale.set(s, s, s);

      placeholder.rotation.x += dt * 0.5;
      placeholder.rotation.y += dt * 0.7;

      renderer.render(scene, camera);

      frames += 1;
      if (now - lastTick >= 500) {
        const fps = (frames * 1000) / (now - lastTick);
        publishWarpStat('fps', Math.round(fps));
        publishWarpStat('cam', `(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`);
        publishWarpStat('scene.objs', scene.children.length);
        publishWarpStat('turtle.s', `${s.toFixed(0)}px`);
        publishWarpStat('streaks.i', streakI.toFixed(2));
        if (ph === 'warp') {
          publishWarpStat('pilot.perch', pilot.perch());
          publishWarpStat('pilot.vel', `${pilot.vel.length().toFixed(0)}px/s`);
          publishWarpStat('pilot.pos', `(${pilot.pos.x.toFixed(0)}, ${pilot.pos.y.toFixed(0)})`);
        }
        frames = 0;
        lastTick = now;
      }
    }
    animate();

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('click', onClick);
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
