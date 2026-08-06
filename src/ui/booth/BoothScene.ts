// The booth's three.js scene — the oracle's attached eye rig in a
// starry void, a red-cloth table, the deck, the dealt cards.
// Imperative class owned by BoothDemo; consumes BoothView, emits
// table clicks. The eyes are leyebrary shader quads: a seeded rose
// mandala at rest, interference ripples while speaking, the log-
// spiral hypnosis field while thinking — one rig, one gaze, vergence
// on the viewer.

import * as THREE from 'three';
import { EyeRig } from '../../leyebrary';
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

export class BoothScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private rig!: EyeRig;
  private stars!: StarField;
  private deck!: THREE.Group;
  private cards = new Map<number, CardMesh>();
  private deckPos = new THREE.Vector3(1.15, -0.42, 0.45);
  private backTex = cardBackTexture();

  private mood: BoothView['eyes'] = 'idle';
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

    // the eyes — one creature, seeded fresh each session so every
    // sitting grows its own mandala
    this.rig = new EyeRig({
      seed: Math.floor(Math.random() * 0x7fffffff),
      pairing: 'match',
      separation: 0.74,
      eyeWidth: 0.64,
    });
    this.rig.group.position.set(0, EYE_Y, -0.2);
    this.rig.setLook('mandala', 0);
    this.scene.add(this.rig.group);

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

  /** slot layout: spread.n cards in a shallow arc across the table */
  private slotPos(index: number, total: number): THREE.Vector3 {
    const spanX = Math.min(2.6, total * 0.62);
    const x = total === 1 ? 0 : -spanX / 2 + (spanX * index) / (total - 1);
    const z = 0.35 - Math.abs(x) * 0.08;
    return new THREE.Vector3(x, -0.64, z);
  }

  update(view: BoothView): void {
    if (view.eyes !== this.mood) {
      this.mood = view.eyes;
      // the mood → look map: rest is the session's mandala, speech is
      // the ripple, and thought drops into the form constants — while
      // the oracle is working, its eyes show what a destabilized
      // visual cortex produces
      this.rig.setLook(
        view.eyes === 'thinking' ? 'vision' : view.eyes === 'speaking' ? 'ripple' : 'mandala',
        view.eyes === 'thinking' ? 0.8 : 1.6,
      );
    }

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
      this.rig.pulse();
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

    // gaze: idle wanders gently around the viewer; thinking LOCKS on
    // them — dead still, pupils tight, the pierce
    const desired = thinking
      ? this.camera.position
      : new THREE.Vector3(
          this.camera.position.x + Math.sin(time * 0.5) * 0.14,
          this.camera.position.y - 0.08 + Math.sin(time * 0.83) * 0.05,
          this.camera.position.z,
        );
    this.gaze.lerp(desired, Math.min(1, dt * (thinking ? 5 : 2.6)));

    // thinking holds perfectly still — the stillness IS the pierce
    this.rig.group.position.y = thinking ? EYE_Y : EYE_Y + Math.sin(time * 0.9) * 0.02;
    this.rig.setGazeTarget(this.gaze);
    this.rig.update(time, dt, this.renderer, this.camera);

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
    this.rig.dispose();
    this.stars.dispose();
    this.renderer.dispose();
  }
}
