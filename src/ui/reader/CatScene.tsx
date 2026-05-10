import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import spriteData from './sprite.json';
import { paintFrame, type SpriteFrame } from './spriteCanvas';

type StateData = {
  frames: SpriteFrame[];
  blink?: SpriteFrame;
  mode?: 'shuffle' | 'loop' | 'hold';
  ms?: number;
};

type SpriteData = {
  states: Record<string, StateData>;
  reactions: Record<string, { frame: SpriteFrame }>;
};

const data = spriteData as SpriteData;

type Props = {
  state?: string;
  reaction?: string | null;
  speaking?: boolean;
  /** Foreground color of the cat (1-bit fill). */
  color?: string;
  /** "Floor" color under the cat — what the canvas paints as background. */
  bgColor?: string;
  /** Approximate width in pixels of the rendering area. Height tracks aspect. */
  width?: number;
  height?: number;
};

/**
 * 3D version of the claude-cat sprite. Frames are repainted to an offscreen
 * canvas; the canvas is mounted as a CanvasTexture on a thin BoxGeometry
 * (= "extruded plane") that gently floats and tilts.
 *
 * Aesthetic target: 1-bit float against the void. No box, no scanlines here
 * — those layers live at the screen level above this scene.
 */
export function CatScene({
  state = 'idle',
  reaction = null,
  speaking = false,
  color = '#b388ff',
  bgColor = '#000000',
  width = 280,
  height = 200,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Drive the frame state via refs so the three.js loop can read it without
  // recreating the scene on every prop change.
  const frameStateRef = useRef({
    state,
    reaction,
    speaking,
    color,
    bgColor,
    frameIdx: 0,
    blinking: false,
    nextBlinkAt: 0,
    nextFrameAt: 0,
  });

  useEffect(() => {
    frameStateRef.current.state = state;
    frameStateRef.current.reaction = reaction;
    frameStateRef.current.speaking = speaking;
    frameStateRef.current.color = color;
    frameStateRef.current.bgColor = bgColor;
  }, [state, reaction, speaking, color, bgColor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Off-screen canvas — the texture source.
    const spriteCanvas = document.createElement('canvas');
    const spriteCtx = spriteCanvas.getContext('2d')!;
    spriteCtx.imageSmoothingEnabled = false;

    // Three.js scene
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 50);
    camera.position.set(0, 0, 4.4);
    camera.lookAt(0, 0, 0);

    // Sprite is 14 cols × 7 rows = 2:1 aspect.
    const planeW = 1.6;
    const planeH = 0.8;
    const planeD = 0.06;
    const geom = new THREE.BoxGeometry(planeW, planeH, planeD);

    const tex = new THREE.CanvasTexture(spriteCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    const front = new THREE.MeshBasicMaterial({ map: tex });
    const edge = new THREE.MeshBasicMaterial({ color: 0x1a0d2c });
    const back = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mesh = new THREE.Mesh(geom, [edge, edge, edge, edge, front, back]);
    scene.add(mesh);

    // Initial frame paint
    const firstFrame =
      data.states[state]?.frames[0] ?? data.states.idle!.frames[0]!;
    paintFrame(spriteCtx, firstFrame, color, bgColor);
    tex.needsUpdate = true;

    let rafId = 0;
    let mounted = true;
    const start = performance.now();

    const animate = () => {
      if (!mounted) return;
      const now = performance.now();
      const t = (now - start) / 1000;

      // Frame cycling
      const fs = frameStateRef.current;
      const stateData =
        (fs.reaction && data.reactions[fs.reaction]?.frame
          ? null
          : data.states[fs.state] ?? data.states.idle!);

      let frame: SpriteFrame;
      if (fs.reaction && data.reactions[fs.reaction]?.frame) {
        frame = data.reactions[fs.reaction]!.frame;
      } else if (stateData) {
        const mode = stateData.mode ?? 'shuffle';
        const ms = (stateData.ms ?? 1500) * (fs.speaking ? 0.4 : 1);
        if (mode !== 'hold' && stateData.frames.length > 1 && now >= fs.nextFrameAt) {
          if (mode === 'loop') {
            fs.frameIdx = (fs.frameIdx + 1) % stateData.frames.length;
          } else {
            fs.frameIdx = Math.floor(Math.random() * stateData.frames.length);
          }
          fs.nextFrameAt = now + ms;
        }
        // Blinking (only in idle)
        if (fs.state === 'idle' && stateData.blink) {
          if (fs.nextBlinkAt === 0) {
            fs.nextBlinkAt = now + 4000 + Math.random() * 5000;
          }
          if (!fs.blinking && now >= fs.nextBlinkAt) {
            fs.blinking = true;
            fs.nextBlinkAt = now + 140; // hold blink
          } else if (fs.blinking && now >= fs.nextBlinkAt) {
            fs.blinking = false;
            fs.nextBlinkAt = now + 4000 + Math.random() * 5000;
          }
        } else {
          fs.blinking = false;
        }

        frame = fs.blinking && stateData.blink
          ? stateData.blink
          : stateData.frames[fs.frameIdx] ?? stateData.frames[0]!;
      } else {
        frame = data.states.idle!.frames[0]!;
      }

      paintFrame(spriteCtx, frame, fs.color, fs.bgColor);
      tex.needsUpdate = true;

      // Float + tilt — subtle, dreamy
      mesh.position.y = Math.sin(t * 0.55) * 0.05;
      mesh.position.x = Math.sin(t * 0.31) * 0.03;
      mesh.rotation.y = Math.sin(t * 0.43) * 0.18;
      mesh.rotation.x = -0.06 + Math.sin(t * 0.36) * 0.05;
      mesh.rotation.z = Math.sin(t * 0.25) * 0.03;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      geom.dispose();
      front.dispose();
      edge.dispose();
      back.dispose();
      tex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="cat-scene" style={{ width, height }} />;
}
