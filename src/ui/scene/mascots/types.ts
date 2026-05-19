// The Mascot interface.
//
// tarobot is a two-phase program: SURVEY → READING. A "mascot" is the
// 3D figure that hosts the user during the SURVEY (and idles in the
// menu). It is NOT the seer — the seer is a separate concept on the
// reading side.
//
// Mascots are swappable. Today: the cat the cat (legacy, currently gated
// off in TarobotScene) and Turtle (loggerhead). Future mascots — or
// per-user customization — drop in the same way as long as they
// implement this shape.
//
// Concretely a Mascot:
//   - owns a single THREE.Group ('group') that gets parented into the
//     scene's position rig (which handles anchor placement + scale)
//   - implements update(ctx) called once per frame with the shared
//     animation context (dt, t, mouse state, dizzy flag)
//   - implements dispose() to release its own resources
//   - may expose a `ready` promise if its assets load async

import type * as THREE from 'three';

/** Shared per-frame inputs every mascot may consult. Most mascots will
 *  ignore most fields — kept uniform so the call site doesn't branch. */
export type MascotContext = {
  /** Seconds since the previous frame, clamped to a sane max. */
  dt: number;
  /** Seconds since the scene mounted. Use for ambient sin-wave motion. */
  t: number;
  /** Mouse-vs-mascot read. `close` true means cursor is inside the
   *  mascot's reactivity hitbox; intensity 0..1 fades to the edge. */
  mouse: {
    dx: number;
    dy: number;
    close: boolean;
    intensity: number;
  };
  /** True while an LLM call is in flight (Investigator, intro,
   *  per-card cognition, etc). Mascots may react: the cat's eyes spin,
   *  Turtle could pulse, future mascots can do whatever. */
  dizzy: boolean;
};

export type Mascot = {
  /** Root group. Parented by the scene; mascot does NOT touch its
   *  transform — that's the rig's job. The mascot is free to animate
   *  CHILDREN of group however it likes. */
  group: THREE.Group;
  /** Called once per frame from the render loop. */
  update: (ctx: MascotContext) => void;
  /** Release all owned geometry / materials / textures. The scene
   *  removes `group` from the parent itself. */
  dispose: () => void;
  /** Optional: resolves once async assets have loaded. */
  ready?: Promise<void>;
};
