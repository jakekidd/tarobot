// The booth's three.js scene — two floating eyes in a starry void, a
// red-cloth table, the deck, the dealt cards. Imperative class owned
// by BoothDemo; consumes BoothView, emits table clicks. The trippy
// pass: rainbow twinkle stars, a breathing iris + additive halo, gaze
// that meets the viewer (and drifts up while thinking), and a slow
// dolly down to the table on entry.

import * as THREE from 'three';
import type { BoothView } from './boothStage';
import { createStarField, type StarField } from './starfield';

const CARD_W = 0.42;
const CARD_H = 0.62;
const EYE_Y = 0.72;
const CAM_END = new THREE.Vector3(0, 0.28, 2.6);
const CAM_START = new THREE.Vector3(0, 2.3, 7.2);
const ENTRY_SECONDS = 2.4;

function cardBackTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1230';
  g.fillRect(0, 0, 256, 384);
  g.strokeStyle = '#6543c7';
  g.lineWidth = 6;
  g.strokeRect(12, 12, 232, 360);
  g.fillStyle = '#6543c7';
  g.font = '90px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('✦', 128, 192);
  return new THREE.CanvasTexture(c);
}

function cardFaceTexture(name: string, position: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe9dc';
  g.fillRect(0, 0, 256, 384);
  g.strokeStyle = '#1b1230';
  g.lineWidth = 5;
  g.strokeRect(10, 10, 236, 364);
  g.fillStyle = '#1b1230';
  g.font = '110px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('✷', 128, 150);
  g.font = 'bold 22px monospace';
  const words = name.toLowerCase().split(' ');
  let line = '';
  let y = 270;
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 16) {
      g.fillText(line.trim(), 128, y);
      y += 26;
      line = w;
    } else line = `${line} ${w}`;
  }
  g.fillText(line.trim(), 128, y);
  g.font = '15px monospace';
  g.fillStyle = '#6b6455';
  g.fillText(position.slice(0, 24), 128, 352);
  return new THREE.CanvasTexture(c);
}

type CardMesh = {
  group: THREE.Group;
  slot: number;
  target: THREE.Vector3;
  flipT: number; // 0 face-down … 1 face-up
  flipping: boolean;
};

type EyeRig = {
  group: THREE.Group;
  irisMat: THREE.MeshBasicMaterial;
  ringMat: THREE.MeshBasicMaterial;
  pupil: THREE.Mesh;
  phase: number;
};

export class BoothScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private eyes: EyeRig[] = [];
  private stars!: StarField;
  private deck!: THREE.Group;
  private cards = new Map<number, CardMesh>();
  private deckPos = new THREE.Vector3(1.15, -0.42, 0.45);
  private backTex = cardBackTexture();

  private mood: BoothView['eyes'] = 'idle';
  private pulse = 0;
  private gaze = CAM_END.clone();
  private entryT = 0;
  private raf = 0;
  private last = 0;

  private canvas: HTMLCanvasElement;
  private onPick: (what: 'deck' | number) => void;

  constructor(canvas: HTMLCanvasElement, onPick: (what: 'deck' | number) => void) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
    this.camera.position.copy(CAM_START);
    this.camera.lookAt(0, -0.6, 0);
    this.build();
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    this.loop(this.last);
  }

  private build(): void {
    this.scene.background = new THREE.Color('#05030c');
    this.scene.add(new THREE.AmbientLight(0x8877aa, 0.7));
    const key = new THREE.PointLight(0xfff2dd, 30, 20);
    key.position.set(1.5, 2.2, 2.5);
    this.scene.add(key);
    const violet = new THREE.PointLight(0x6543c7, 14, 12);
    violet.position.set(-2, 0.6, 1);
    this.scene.add(violet);

    this.stars = createStarField(this.renderer.getPixelRatio());
    this.scene.add(this.stars.points);

    // the table — red cloth
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.1, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x7a1220, roughness: 0.92 }),
    );
    table.position.set(0, -0.72, 0.1);
    this.scene.add(table);
    const drape = new THREE.Mesh(
      new THREE.BoxGeometry(3.7, 0.5, 1.95),
      new THREE.MeshStandardMaterial({ color: 0x5c0d18, roughness: 0.96 }),
    );
    drape.position.set(0, -1.0, 0.08);
    this.scene.add(drape);

    // the eyes
    const l = this.makeEye(0);
    const r = this.makeEye(Math.PI / 2);
    l.group.position.set(-0.3, EYE_Y, -0.2);
    r.group.position.set(0.3, EYE_Y, -0.2);
    this.eyes = [l, r];
    this.scene.add(l.group, r.group);

    // the deck — on the table from the very start (inert until the deal)
    this.deck = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(CARD_W, 0.012, CARD_H),
        new THREE.MeshStandardMaterial({ color: i === 15 ? 0x2a1b4d : 0x1b1230, roughness: 0.6 }),
      );
      m.position.y = i * 0.012;
      m.name = 'deck';
      this.deck.add(m);
    }
    this.deck.position.copy(this.deckPos);
    this.deck.rotation.y = -0.35;
    this.scene.add(this.deck);
  }

  private makeEye(phase: number): EyeRig {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0xf2ecff, roughness: 0.35 }),
    );
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9d6cff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.117, 48), ringMat);
    ring.position.z = 0.157;
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x6543c7 });
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), irisMat);
    iris.position.z = 0.162;
    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.034, 32),
      new THREE.MeshBasicMaterial({ color: 0x05030c }),
    );
    pupil.position.z = 0.168;
    g.add(ball, ring, iris, pupil);
    return { group: g, irisMat, ringMat, pupil, phase };
  }

  /** slot layout: spread.n cards in a shallow arc across the table */
  private slotPos(index: number, total: number): THREE.Vector3 {
    const spanX = Math.min(2.6, total * 0.62);
    const x = total === 1 ? 0 : -spanX / 2 + (spanX * index) / (total - 1);
    const z = 0.35 - Math.abs(x) * 0.08;
    return new THREE.Vector3(x, -0.64, z);
  }

  update(view: BoothView): void {
    this.mood = view.eyes;

    view.cards.forEach((card, i) => {
      if (!card.dealt) return;
      let cm = this.cards.get(card.slot);
      if (!cm) {
        const group = new THREE.Group();
        const back = new THREE.Mesh(
          new THREE.PlaneGeometry(CARD_W, CARD_H),
          new THREE.MeshStandardMaterial({ map: this.backTex, roughness: 0.5 }),
        );
        back.rotation.x = -Math.PI / 2;
        back.position.y = 0.012;
        back.name = `card-${card.slot}`;
        group.add(back);
        group.position.copy(this.deckPos);
        this.scene.add(group);
        cm = {
          group,
          slot: card.slot,
          target: this.slotPos(i, view.cards.length),
          flipT: 0,
          flipping: false,
        };
        this.cards.set(card.slot, cm);
      }
      if (card.flipped && !cm.flipping && cm.flipT === 0) {
        cm.flipping = true;
        // the face appears at the flip's halfway point
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(CARD_W, CARD_H),
          new THREE.MeshStandardMaterial({
            map: cardFaceTexture(card.name ?? '', card.position),
            roughness: 0.5,
          }),
        );
        face.rotation.x = Math.PI / 2;
        face.rotation.z = Math.PI;
        face.position.y = -0.001;
        face.name = `card-${card.slot}`;
        cm.group.add(face);
      }
    });

    if (view.subtitleSeq !== this.lastSeq) {
      this.lastSeq = view.subtitleSeq;
      this.pulse = 1;
    }
  }
  private lastSeq = 0;

  private onPointer = (ev: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      const name = h.object.name;
      if (name === 'deck') {
        this.onPick('deck');
        return;
      }
      if (name.startsWith('card-')) {
        this.onPick(Number(name.slice(5)));
        return;
      }
    }
  };

  private resize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private loop = (t: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const time = t / 1000;
    const thinking = this.mood === 'thinking';

    // the entry: dolly down out of the void to the seat at the table
    if (this.entryT < 1) {
      this.entryT = Math.min(1, this.entryT + dt / ENTRY_SECONDS);
      const u = this.entryT;
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      this.camera.position.lerpVectors(CAM_START, CAM_END, e);
      this.camera.lookAt(0, THREE.MathUtils.lerp(-0.6, -0.05, e), 0);
    }

    this.stars.update(time);

    // gaze: meet the viewer's eyes; thinking drifts up and away
    const desired = thinking
      ? new THREE.Vector3(
          Math.sin(time * 0.9) * 1.6,
          2.0 + Math.sin(time * 1.31) * 0.5,
          1.4,
        )
      : new THREE.Vector3(
          this.camera.position.x + Math.sin(time * 0.5) * 0.14,
          this.camera.position.y - 0.08 + Math.sin(time * 0.83) * 0.05,
          this.camera.position.z,
        );
    this.gaze.lerp(desired, Math.min(1, dt * (thinking ? 1.7 : 2.6)));

    if (this.pulse > 0) this.pulse -= dt * 1.4;
    const shimmer = 1 + Math.max(0, this.pulse) * 0.1 * Math.sin(time * 22);

    for (const eye of this.eyes) {
      eye.group.position.y = EYE_Y + Math.sin(time * 0.9 + eye.phase) * 0.02;
      eye.group.lookAt(this.gaze);
      eye.group.scale.setScalar(shimmer);
      // the breathing iris — hue drifts around violet, the halo waves;
      // thinking runs hotter and faster, pupils dilate
      const h = (0.72 + Math.sin(time * 0.23 + eye.phase) * 0.06 + 1) % 1;
      const l =
        0.42 + (thinking ? 0.16 : 0.08) * Math.sin(time * (thinking ? 3.4 : 0.8) + eye.phase);
      eye.irisMat.color.setHSL(h, 0.75, Math.max(0.3, l));
      eye.ringMat.color.setHSL((h + 0.07) % 1, 0.85, 0.62);
      eye.ringMat.opacity = thinking
        ? 0.42 + 0.3 * Math.sin(time * 4.2 + eye.phase)
        : 0.2 + 0.15 * Math.sin(time * 1.3 + eye.phase);
      const dilate = thinking ? 1.3 : 1;
      const ps = eye.pupil.scale.x + (dilate - eye.pupil.scale.x) * Math.min(1, dt * 4);
      eye.pupil.scale.set(ps, ps, 1);
    }

    // cards: slide from deck to slot, then flip in place
    for (const cm of this.cards.values()) {
      cm.group.position.lerp(cm.target, Math.min(1, dt * 5));
      if (cm.flipping) {
        cm.flipT = Math.min(1, cm.flipT + dt * 2.2);
        cm.group.rotation.z = cm.flipT * Math.PI;
        cm.group.position.y = cm.target.y + Math.sin(cm.flipT * Math.PI) * 0.28;
        if (cm.flipT >= 1) {
          cm.flipping = false;
          cm.group.rotation.z = Math.PI;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.stars.dispose();
    this.renderer.dispose();
  }
}
