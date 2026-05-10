import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

type Props = {
  width?: number;
  height?: number;
  /** Distance between the two eye centers, in scene units. */
  separation?: number;
};

/**
 * Two rigidly-attached glowing eyes floating in the void.
 *
 * Both eyes are children of a single Group node — they share head motion
 * and never drift apart. The group bobs and tilts gently. Eyes blink in
 * unison (scaleY → 0 briefly) on randomized intervals.
 *
 * Bloom post-processing makes them feel like actual light sources.
 */
export function Eyes({ width = 380, height = 220, separation = 1.0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 50);
    camera.position.set(0, 0, 4.6);
    camera.lookAt(0, 0, 0);

    // The "head" — both eyes are children. They move as one.
    const head = new THREE.Group();
    scene.add(head);

    const eyeGeom = new THREE.SphereGeometry(0.13, 28, 18);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb388ff });

    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat.clone());
    leftEye.position.set(-separation / 2, 0, 0);
    rightEye.position.set(separation / 2, 0, 0);
    head.add(leftEye);
    head.add(rightEye);

    // Bloom — makes them read as light sources
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.95,    // strength
      0.85,    // radius
      0.25,    // threshold
    ));
    composer.addPass(new OutputPass());

    let paused = document.visibilityState !== 'visible';
    const onVisibilityChange = () => {
      paused = document.visibilityState !== 'visible';
      if (!paused && rafId === 0 && mounted) {
        rafId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let rafId = 0;
    let mounted = true;
    const start = performance.now();

    // Blink scheduling — both eyes in sync
    let nextBlinkAt = start + 2000 + Math.random() * 3000;
    let blinking = false;
    let blinkStartedAt = 0;
    const BLINK_DURATION_MS = 130;

    const animate = () => {
      if (!mounted) return;
      if (paused) {
        rafId = 0;
        return;
      }
      const now = performance.now();
      const t = (now - start) / 1000;

      // Head bob — independent low-freq sines for life-like drift
      head.position.x = Math.sin(t * 0.31) * 0.04;
      head.position.y = Math.sin(t * 0.45) * 0.03;
      head.rotation.z = (Math.sin(t * 0.27) * 0.5 + Math.sin(t * 0.71) * 0.3) * 0.05;
      head.rotation.y = Math.sin(t * 0.39) * 0.06;

      // Blink — scale Y of both eyes together
      if (!blinking && now >= nextBlinkAt) {
        blinking = true;
        blinkStartedAt = now;
      }
      let scaleY = 1;
      if (blinking) {
        const p = (now - blinkStartedAt) / BLINK_DURATION_MS;
        if (p >= 1) {
          blinking = false;
          nextBlinkAt = now + 2200 + Math.random() * 3200;
          scaleY = 1;
        } else {
          // Triangle: 0 → 1 → 0 over the blink. Eye flattens then opens.
          scaleY = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2;
          scaleY = Math.max(0.05, scaleY);
        }
      }
      leftEye.scale.y = scaleY;
      rightEye.scale.y = scaleY;

      composer.render();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      eyeGeom.dispose();
      eyeMat.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [width, height, separation]);

  return <div ref={containerRef} style={{ width, height }} className="eyes" />;
}
