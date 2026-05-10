import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { DrawnCards } from '../../pipeline';
import { getCardBackTexture, getCardFrontTexture } from './cardTextures';
import { flip as flipSound } from '../sound/sound';

type Props = {
  drawn: DrawnCards;
  /** Position ids of cards currently revealed (face-up). */
  flippedIds: ReadonlySet<string>;
  /** When true, cards animate in from below as they enter (placement phase). */
  animateIn?: boolean;
  onCardClick?: (positionId: string) => void;
};

const CARD_W = 1;
const CARD_H = 1.6;
const CARD_D = 0.04;
const CARD_SPACING = 1.7; // multiplier on layout coords
const ENTER_DELAY_MS = 280;
const ENTER_DURATION_MS = 700;
const FLIP_DURATION_MS = 700;

type CardState = {
  id: string;                     // SpreadPosition.id
  group: THREE.Group;             // outer group: handles Y-translation for entry
  inner: THREE.Mesh;              // mesh: rotated for flip
  targetY: number;
  enterStart: number | null;      // ms timestamp of entry start; null = settled
  flipStart: number | null;       // ms timestamp of current flip; null = settled
  flipFrom: number;               // rotation.y at flip start
  flipTo: number;                 // rotation.y target
  hovered: boolean;
};

export function Spread3D({ drawn, flippedIds, animateIn = false, onCardClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    cards: CardState[];
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    rafId: number;
    mounted: boolean;
  } | null>(null);

  // Mount: create scene once. drawn is captured by closure on first mount;
  // flips/clicks route through refs that are synced via effects (below).
  const drawnRef = useRef(drawn);
  const flippedRef = useRef(flippedIds);
  const onClickRef = useRef(onCardClick);

  useEffect(() => { drawnRef.current = drawn; }, [drawn]);
  useEffect(() => { flippedRef.current = flippedIds; }, [flippedIds]);
  useEffect(() => { onClickRef.current = onCardClick; }, [onCardClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 600;
    const h = container.clientHeight || 480;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50);
    camera.position.set(0, 0.6, 5.4);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff0d0, 0.9);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6c4ec2, 0.35);
    fill.position.set(-3, 2, 2);
    scene.add(fill);

    const backTex = getCardBackTexture();
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0x2a1d44 });

    const cards: CardState[] = drawnRef.current.cards.map(({ position, card }, idx) => {
      const frontTex = getCardFrontTexture(card);

      const geom = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
      // BoxGeometry face order: [+x, -x, +y, -y, +z, -z]
      const materials: THREE.Material[] = [
        edgeMat, edgeMat, edgeMat, edgeMat,
        new THREE.MeshLambertMaterial({ map: backTex }),    // +z: visible when face-down
        new THREE.MeshLambertMaterial({ map: frontTex }),   // -z: visible after π flip
      ];
      const mesh = new THREE.Mesh(geom, materials);
      mesh.userData.positionId = position.id;
      mesh.userData.cardIdx = idx;

      const group = new THREE.Group();
      group.add(mesh);

      const targetX = position.layout.x * CARD_SPACING;
      const targetY = position.layout.y * CARD_SPACING;
      group.position.set(targetX, animateIn ? targetY - 3 : targetY, 0);

      // Slight tilt: each card lays back a bit so we see its face from above.
      mesh.rotation.x = -Math.PI * 0.06;

      scene.add(group);

      const enterStart = animateIn ? performance.now() + idx * ENTER_DELAY_MS : null;

      return {
        id: position.id,
        group,
        inner: mesh,
        targetY,
        enterStart,
        flipStart: null,
        flipFrom: 0,
        flipTo: 0,
        hovered: false,
      };
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onResize = () => {
      const wNew = container.clientWidth || 600;
      const hNew = container.clientHeight || 480;
      renderer.setSize(wNew, hNew);
      camera.aspect = wNew / hNew;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
      const meshes = cards.map((c) => c.inner);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return;
      const id = hits[0]!.object.userData.positionId as string;
      onClickRef.current?.(id);
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    const state = {
      renderer, scene, camera, cards, raycaster, pointer,
      rafId: 0,
      mounted: true,
    };
    stateRef.current = state;

    const animate = () => {
      if (!state.mounted) return;
      const now = performance.now();

      // Hover detection
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(cards.map((c) => c.inner), false);
      const hoveredId = hits[0]?.object.userData.positionId as string | undefined;
      let cursor = 'default';

      for (const card of cards) {
        // Entry animation
        if (card.enterStart !== null) {
          const t = (now - card.enterStart) / ENTER_DURATION_MS;
          if (t >= 1) {
            card.group.position.y = card.targetY;
            card.enterStart = null;
          } else if (t >= 0) {
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            card.group.position.y = (card.targetY - 3) + eased * 3;
          }
        }

        // Flip target tracking
        const shouldBeFlipped = flippedRef.current.has(card.id);
        const desiredRotY = shouldBeFlipped ? Math.PI : 0;
        if (card.inner.rotation.y !== desiredRotY && card.flipStart === null) {
          // Don't snap; start a flip animation toward the new target.
          if (Math.abs(card.inner.rotation.y - desiredRotY) > 0.01) {
            card.flipStart = now;
            card.flipFrom = card.inner.rotation.y;
            card.flipTo = desiredRotY;
            flipSound();
          }
        }

        // Flip animation
        if (card.flipStart !== null) {
          const t = (now - card.flipStart) / FLIP_DURATION_MS;
          if (t >= 1) {
            card.inner.rotation.y = card.flipTo;
            card.flipStart = null;
          } else {
            const eased = t < 0.5
              ? 4 * t * t * t
              : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
            card.inner.rotation.y = card.flipFrom + (card.flipTo - card.flipFrom) * eased;
          }
        }

        // Hover lift
        const wasHovered = card.hovered;
        card.hovered = hoveredId === card.id && card.enterStart === null;
        const targetZ = card.hovered ? 0.25 : 0;
        card.group.position.z += (targetZ - card.group.position.z) * 0.18;
        if (card.hovered) cursor = 'pointer';
        if (wasHovered !== card.hovered) {
          // (no-op hook for sounds/etc.)
        }
      }

      renderer.domElement.style.cursor = cursor;
      renderer.render(scene, camera);
      state.rafId = requestAnimationFrame(animate);
    };
    state.rafId = requestAnimationFrame(animate);

    return () => {
      state.mounted = false;
      cancelAnimationFrame(state.rafId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      cards.forEach((c) => {
        scene.remove(c.group);
        c.inner.geometry.dispose();
        const mats = c.inner.material;
        if (Array.isArray(mats)) mats.forEach((m) => m.dispose());
        else mats.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
    // We deliberately mount once; drawn/flipped/onCardClick are read via refs.
  }, [animateIn]);

  return <div ref={containerRef} className="spread3d" />;
}
