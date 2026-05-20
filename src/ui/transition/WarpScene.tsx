// Bare three.js skeleton for the warp demo. Built debug-first: visible
// RGB axes at origin, faint grid on xz, a wireframe placeholder sphere
// where the turtle will sit, and per-frame stats published to warpLog
// so the HUD can show fps / camera-pos / object count without anyone
// having to instrument anything new.
//
// Coordinate convention mirrors TarobotScene (the main app's main scene):
//   - OrthographicCamera at (0, 0, 100) looking down -Z
//   - +X right, +Y up, +Z toward camera
//   - Visible viewport in world units roughly = window pixels
//
// Future steps mount the star shader (fullscreen plane behind), the
// turtle mascot (centered), and the disintegrate FX into this same
// scene. Expose onReady so callers can hand the scene to those layers.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { publishWarpStat, warpLog } from './warpLog';

export type SceneHandle = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
};

type Props = {
  /** Called once the scene is ready. Receiver can add objects; they'll
   *  render starting next frame. Receiver does NOT own teardown — this
   *  component disposes everything it added to its own scene root. */
  onReady?: (handle: SceneHandle) => () => void;
};

// Axes / grid sizes in world units. Picked so they're visible without
// dominating once the star shader lands.
const AXES_SIZE = 60;
const GRID_SIZE = 600;
const GRID_DIVISIONS = 20;
const PLACEHOLDER_RADIUS = 30;

export function WarpScene({ onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

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

    // Ortho camera in window-pixel units — matches TarobotScene. Set
    // bounds inside sizeRig() so resize keeps the aspect right.
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
    // AxesHelper: red = +X, green = +Y, blue = +Z. Size = world units.
    const axes = new THREE.AxesHelper(AXES_SIZE);
    scene.add(axes);

    // Grid on the xz plane (lies flat under the action). Faint so it
    // doesn't fight with the star shader later. Disposed in cleanup.
    const grid = new THREE.GridHelper(
      GRID_SIZE,
      GRID_DIVISIONS,
      0x335577, // center lines
      0x223344, // outer lines
    );
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    scene.add(grid);

    // Placeholder for the turtle — wireframe sphere at origin. Easy to
    // see, cheap to render, gone the moment the real mascot lands.
    const placeholderGeom = new THREE.IcosahedronGeometry(PLACEHOLDER_RADIUS, 1);
    const placeholderMat = new THREE.MeshBasicMaterial({
      color: 0x6dff8a,
      wireframe: true,
    });
    const placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
    scene.add(placeholder);

    // Camera-bounds rectangle — outlines the visible viewport so we can
    // tell at a glance if something's clipping. Sized in sizeRig.
    const boundsMat = new THREE.LineBasicMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0.35,
    });
    const boundsGeom = new THREE.BufferGeometry();
    const bounds = new THREE.LineLoop(boundsGeom, boundsMat);
    scene.add(bounds);
    function updateBounds(): void {
      const w = camera.right - camera.left;
      const h = camera.top - camera.bottom;
      const verts = new Float32Array([
        -w / 2,  h / 2, 0,
         w / 2,  h / 2, 0,
         w / 2, -h / 2, 0,
        -w / 2, -h / 2, 0,
      ]);
      boundsGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      boundsGeom.attributes.position.needsUpdate = true;
    }
    updateBounds();

    function onResize(): void {
      sizeRig();
      updateBounds();
    }
    window.addEventListener('resize', onResize);

    // Hand the scene out for whoever wants to add stuff. They return a
    // teardown fn we run on unmount.
    const externalCleanup = onReady?.({ scene, camera, renderer });

    warpLog(`WarpScene mounted: viewport ${container.clientWidth}×${container.clientHeight}`);

    // ── Render loop with FPS / counters publishing ───────
    let raf = 0;
    let frames = 0;
    let lastTick = performance.now();
    let spinPhase = 0;

    function animate(): void {
      if (!mounted) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now();

      // Gentle rotation on the placeholder so the wireframe reads as
      // a 3D object (and not a flat hex).
      spinPhase += 0.005;
      placeholder.rotation.x = spinPhase * 0.7;
      placeholder.rotation.y = spinPhase;

      renderer.render(scene, camera);

      // Stats
      frames += 1;
      if (now - lastTick >= 500) {
        const fps = (frames * 1000) / (now - lastTick);
        publishWarpStat('fps', Math.round(fps));
        publishWarpStat('cam', `(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`);
        publishWarpStat('scene.objs', scene.children.length);
        frames = 0;
        lastTick = now;
      }
    }
    animate();

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      try { externalCleanup?.(); } catch (err) { console.warn('[WarpScene] external cleanup threw:', err); }
      placeholderGeom.dispose();
      placeholderMat.dispose();
      boundsGeom.dispose();
      boundsMat.dispose();
      // AxesHelper / GridHelper own their geometry+materials internally;
      // calling .dispose() on a GridHelper is safe in r150+.
      axes.dispose?.();
      grid.dispose?.();
      renderer.dispose();
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
      warpLog('WarpScene unmounted');
    };
  }, [onReady]);

  return <div ref={containerRef} className="warp-scene" />;
}
