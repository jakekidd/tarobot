// Bird's-eye 3D view of the dialogue tree. Own three.js canvas — fully
// independent of TarobotScene. Camera is orthographic-top-down with a
// slight tilt for depth perception. Each node is a card-shaped plane
// with its question text painted on it via a CanvasTexture. Edges
// connect parents to followups (default `next` in white, per-answer
// overrides in violet).
//
// Interaction:
//   - drag: pan the camera
//   - wheel: zoom
//   - click on a card: select it (notified via onSelect)
//   - click empty space: deselect

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { DialogueTree, AnswerFormat } from '../pipeline/survey';
import { layoutTree, type Layout, type NodePos } from './layout';

type Props = {
  tree: DialogueTree;
  selected: string | null;
  onSelect: (id: string | null) => void;
};

const CARD_W = 1.6;
const CARD_H = 1.0;

const KIND_BG: Record<NodePos['kind'], string> = {
  opener:   '#1f1538',
  root:     '#15102a',
  followup: '#0b0820',
};
const KIND_BORDER: Record<NodePos['kind'], string> = {
  opener:   '#b388ff',
  root:     '#7c3aed',
  followup: '#564a78',
};
const FMT_ACCENT: Record<AnswerFormat, string> = {
  text:   '#e2e2ff',
  date:   '#7dd3fc',
  choice: '#b388ff',
  binary: '#fbbf24',
  multi:  '#86efac',
  matrix: '#f472b6',
};

export function JadeScene({ tree, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout is recomputed when the tree's structure changes. Text edits
  // don't move nodes (good — the friend's mental map stays stable). We
  // do regenerate textures on every tree change though, so edited text
  // shows up immediately.
  const layout = useMemo<Layout>(() => layoutTree(tree), [tree]);

  // Latest selected id, accessible from the long-lived scene loop.
  const selectedRef = useRef<string | null>(selected);
  // Latest onSelect callback, accessible from raycaster handlers.
  const onSelectRef = useRef(onSelect);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;
    const container: HTMLDivElement = containerEl;

    // ─── renderer + scene + camera ────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x05030c, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Wider working area than the bounds suggests so the user can pan freely.
    const dims = () => {
      const r = container.getBoundingClientRect();
      return { w: r.width, h: r.height };
    };

    let zoom = 1;
    const cameraTarget = new THREE.Vector3(
      (layout.bounds.minX + layout.bounds.maxX) / 2,
      (layout.bounds.minY + layout.bounds.maxY) / 2,
      0,
    );
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    // Position camera ABOVE the plane (z) and slightly back (y) so it tilts
    // into the layout — gives a bird's-eye with a sense of depth.
    function placeCamera() {
      const { w, h } = dims();
      const span = 16 / zoom;
      const aspect = Math.max(0.001, w / h);
      camera.left = -span * aspect;
      camera.right = span * aspect;
      camera.top = span;
      camera.bottom = -span;
      camera.position.set(cameraTarget.x, cameraTarget.y - 6, 18);
      camera.lookAt(cameraTarget);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    placeCamera();

    // ─── per-node card meshes ─────────────────────────────
    const cardGeom = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const cardMeshes = new Map<string, THREE.Mesh>();
    const cardMats = new Map<string, THREE.MeshBasicMaterial>();
    const cardTexs: THREE.CanvasTexture[] = [];

    for (const np of layout.nodes.values()) {
      const node = tree.nodes[np.id];
      if (!node) continue;
      const tex = makeCardTexture(np.id, node.q, node.f, np.kind, false);
      cardTexs.push(tex);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const mesh = new THREE.Mesh(cardGeom, mat);
      mesh.position.set(np.x, np.y, 0);
      // Flat to the bird's eye but with a tiny tilt to read in the slight
      // camera angle.
      mesh.rotation.x = 0;
      mesh.userData.id = np.id;
      scene.add(mesh);
      cardMeshes.set(np.id, mesh);
      cardMats.set(np.id, mat);
    }

    // ─── edges ────────────────────────────────────────────
    const edgeGroup = new THREE.Group();
    scene.add(edgeGroup);
    rebuildEdges();
    function rebuildEdges() {
      edgeGroup.clear();
      const nextPoints: number[] = [];
      const answerPoints: number[] = [];
      for (const e of layout.edges) {
        const from = layout.nodes.get(e.from);
        const to = layout.nodes.get(e.to);
        if (!from || !to) continue;
        const arr = e.via === 'next' ? nextPoints : answerPoints;
        arr.push(from.x, from.y, -0.05, to.x, to.y, -0.05);
      }
      if (nextPoints.length > 0) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(nextPoints, 3));
        edgeGroup.add(new THREE.LineSegments(
          g, new THREE.LineBasicMaterial({ color: 0x564a78, transparent: true, opacity: 0.55 }),
        ));
      }
      if (answerPoints.length > 0) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(answerPoints, 3));
        edgeGroup.add(new THREE.LineSegments(
          g, new THREE.LineBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.8 }),
        ));
      }
    }

    // ─── pan / zoom / pick ────────────────────────────────
    let dragging = false;
    let didDrag = false;
    let dragStartX = 0, dragStartY = 0;
    let camStartX = 0, camStartY = 0;

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      didDrag = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      camStartX = cameraTarget.x;
      camStartY = cameraTarget.y;
      (e.target as Element)?.setPointerCapture?.(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.hypot(dx, dy) > 4) didDrag = true;
      const { w, h } = dims();
      const span = 16 / zoom;
      const scale = (span * 2) / Math.min(w, h);
      cameraTarget.x = camStartX - dx * scale;
      cameraTarget.y = camStartY + dy * scale;
      placeCamera();
    }
    function onPointerUp(e: PointerEvent) {
      dragging = false;
      if (didDrag) return;
      const id = pickAt(e.clientX, e.clientY);
      onSelectRef.current(id);
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const step = -e.deltaY * 0.001;
      zoom = Math.max(0.35, Math.min(3.0, zoom * (1 + step)));
      placeCamera();
    }

    const raycaster = new THREE.Raycaster();
    function pickAt(clientX: number, clientY: number): string | null {
      const r = container.getBoundingClientRect();
      const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
      const ndcY = -((clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObjects(Array.from(cardMeshes.values()), false);
      const id = hits[0]?.object.userData.id;
      return typeof id === 'string' ? id : null;
    }

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => placeCamera();
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // ─── render loop ──────────────────────────────────────
    let rafId = 0;
    let mounted = true;
    let lastSelectedShown: string | null = null;

    const animate = () => {
      if (!mounted) return;
      // Repaint selection ring when the selected id changes.
      const cur = selectedRef.current;
      if (cur !== lastSelectedShown) {
        // Repaint just the affected cards (old + new).
        if (lastSelectedShown) repaintCard(lastSelectedShown, false);
        if (cur) repaintCard(cur, true);
        lastSelectedShown = cur;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    function repaintCard(id: string, isSelected: boolean) {
      const np = layout.nodes.get(id);
      const node = tree.nodes[id];
      const mat = cardMats.get(id);
      if (!np || !node || !mat || !mat.map) return;
      // Replace the texture with a fresh paint reflecting selection state.
      const old = mat.map as THREE.CanvasTexture;
      const next = makeCardTexture(id, node.q, node.f, np.kind, isSelected);
      mat.map = next;
      mat.needsUpdate = true;
      cardTexs.push(next);
      old.dispose();
    }
    rafId = requestAnimationFrame(animate);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      ro.disconnect();
      for (const m of cardMats.values()) m.dispose();
      for (const t of cardTexs) t.dispose();
      cardGeom.dispose();
      edgeGroup.clear();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  return <div ref={containerRef} className="jade-scene" />;
}

// ─── Card texture painter ──────────────────────────────────

function makeCardTexture(
  id: string,
  question: string,
  fmt: AnswerFormat,
  kind: NodePos['kind'],
  isSelected: boolean,
): THREE.CanvasTexture {
  const W = 384;
  const H = 240;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background plate
  ctx.fillStyle = KIND_BG[kind];
  roundFill(ctx, 6, 6, W - 12, H - 12, 12);

  // Border — thicker / brighter when selected
  ctx.strokeStyle = isSelected ? '#ffffff' : KIND_BORDER[kind];
  ctx.lineWidth = isSelected ? 6 : 2.5;
  roundStroke(ctx, 6, 6, W - 12, H - 12, 12);

  // Format accent bar (left edge)
  ctx.fillStyle = FMT_ACCENT[fmt];
  roundFill(ctx, 6, 6, 8, H - 12, 4);

  // Format label (top-right)
  ctx.fillStyle = FMT_ACCENT[fmt];
  ctx.font = '600 16px "VT323", ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(fmt.toUpperCase(), W - 16, 16);

  // Node id (top-left, dim)
  ctx.fillStyle = 'rgba(212, 199, 255, 0.55)';
  ctx.font = '14px "VT323", ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(id, 28, 18);

  // Question text, wrapped, centered vertically below the id
  ctx.fillStyle = '#e8e0ff';
  ctx.font = '22px "IM Fell English", "Cormorant Garamond", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  wrapText(ctx, question, 28, 50, W - 48, 26);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  lineH: number,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let yy = y;
  for (const w of words) {
    const candidate = line ? line + ' ' + w : w;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      yy += lineH;
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function roundFill(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  path(ctx, x, y, w, h, r);
  ctx.fill();
}
function roundStroke(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  path(ctx, x, y, w, h, r);
  ctx.stroke();
}
function path(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
