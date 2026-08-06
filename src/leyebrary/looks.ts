// The look registry — every named way the eyes can be. A look is
// data: which field the iris runs, which palette voices it, how fast
// it moves, how open the pupil sits. The rig crossfades between looks
// so a mood change is a morph, never a cut.

import { PALETTES, type Palette, generateRose, shiftPalette, type RoseParams } from './math';

// field() indices in glsl.ts, plus the two special modes
export const FIELD_MODES = {
  spiral: 0,
  warp: 1,
  interference: 2,
  kaleido: 3,
  tunnel: 4,
  phyllo: 5,
  rose: 6,
  trails: 7,
} as const;

export type LookName =
  | 'nebula'
  | 'hypnosis'
  | 'ripple'
  | 'prism'
  | 'descent'
  | 'bloom'
  | 'mandala'
  | 'trails';

export type Look = {
  mode: number;
  palette: Palette;
  speed: number;
  energy: number;
  pupil: number;
};

export const LOOKS: Record<LookName, Look> = {
  // idle default — domain-warped nebula breathing in the brand lane
  nebula: {
    mode: FIELD_MODES.warp,
    palette: PALETTES.vesper,
    speed: 0.5,
    energy: 0.85,
    pupil: 0.3,
  },
  // the OG resurrected — log-spiral falling inward forever
  hypnosis: {
    mode: FIELD_MODES.spiral,
    palette: PALETTES.spectrum,
    speed: 1.0,
    energy: 1.15,
    pupil: 0.24,
  },
  // the violet→turquoise ripple, now a true interference field
  ripple: {
    mode: FIELD_MODES.interference,
    palette: PALETTES.vesper,
    speed: 1.0,
    energy: 1.0,
    pupil: 0.3,
  },
  // kaleido-folded spiral — the reveal burst
  prism: {
    mode: FIELD_MODES.kaleido,
    palette: PALETTES.spectrum,
    speed: 0.8,
    energy: 1.2,
    pupil: 0.32,
  },
  // log-polar tunnel — the closing, everything walks into the pupil
  descent: {
    mode: FIELD_MODES.tunnel,
    palette: PALETTES.ember,
    speed: 0.9,
    energy: 1.0,
    pupil: 0.38,
  },
  // phyllotaxis lattice slowly counter-rotating — biological order
  bloom: {
    mode: FIELD_MODES.phyllo,
    palette: PALETTES.spectrum,
    speed: 0.7,
    energy: 1.1,
    pupil: 0.28,
  },
  // seeded rose-curve flower (rhodonea / spirograph family)
  mandala: {
    mode: FIELD_MODES.rose,
    palette: PALETTES.spectrum,
    speed: 1.0,
    energy: 1.25,
    pupil: 0.22,
  },
  // the MilkDrop loop living inside the iris
  trails: {
    mode: FIELD_MODES.trails,
    palette: PALETTES.spectrum,
    speed: 0.9,
    energy: 1.1,
    pupil: 0.3,
  },
};

export const LOOK_NAMES = Object.keys(LOOKS) as LookName[];

// A session's genome: the seed fixes the mandala geometry and the
// palette pairing. 'match' gives both eyes the identical voice;
// 'complement' slides the right eye half a palette cycle away.
export type EyePairing = 'match' | 'complement';

export type SessionGenome = {
  rose: RoseParams;
  pairing: EyePairing;
  paletteFor: (look: Look, eyeIndex: number) => Palette;
};

export function sessionGenome(seed: number, pairing: EyePairing = 'match'): SessionGenome {
  return {
    rose: generateRose(seed),
    pairing,
    paletteFor: (look, eyeIndex) =>
      pairing === 'complement' && eyeIndex === 1 ? shiftPalette(look.palette, 0.5) : look.palette,
  };
}
