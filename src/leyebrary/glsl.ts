// GLSL twins of math.ts. Every constant is interpolated from
// GLSL_CONSTS so the tested TypeScript mirrors and the shaders can
// never drift apart silently. Chunks compose bottom-up: common →
// fields → the eye / membrane fragment programs.

import { GLSL_CONSTS as C } from './math';

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const COMMON = /* glsl */ `
const float TAU = 6.283185307179586;
const float EYE_ASPECT = ${C.EYE_ASPECT};

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(${C.HASH_KX}, ${C.HASH_KY}))) * ${C.HASH_SCALE});
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < ${C.FBM_OCTAVES}; i++) {
    sum += amp * valueNoise(p);
    amp *= ${C.FBM_GAIN};
    p *= ${C.FBM_LACUNARITY};
  }
  return sum;
}

vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}
`;

const FIELDS = /* glsl */ `
float spiralField(vec2 p, float t) {
  float r = max(1e-6, length(p));
  float theta = atan(p.y, p.x);
  return sin(${C.SPIRAL_ARMS} * theta + ${C.SPIRAL_TWIST} * log(r) - ${C.SPIRAL_SPEED} * t);
}

float warpField(vec2 p, float t) {
  vec2 q = vec2(
    fbm(p + vec2(${C.WARP_DRIFT} * t, 0.0)),
    fbm(p + vec2(5.2, 1.3 - ${C.WARP_DRIFT} * t * 0.7))
  );
  vec2 r = vec2(
    fbm(p + ${C.WARP_A} * q + vec2(1.7, 9.2)),
    fbm(p + ${C.WARP_B} * q + vec2(8.3, 2.8))
  );
  return fbm(p + 4.0 * r);
}

float interferenceField(vec2 p, float t) {
  float sum = 0.0;
  for (int i = 0; i < ${C.INTERF_CENTERS}; i++) {
    float fi = float(i);
    float a = fi / float(${C.INTERF_CENTERS}) * TAU + t * (0.11 + 0.05 * fi);
    vec2 c = vec2(cos(a), sin(a * 1.3)) * ${C.INTERF_ORBIT};
    sum += sin(length(p - c) * ${C.INTERF_FREQ} - t * ${C.INTERF_SPEED});
  }
  return sum / float(${C.INTERF_CENTERS});
}

vec2 kaleidoFold(vec2 p) {
  float r = length(p);
  float theta = atan(p.y, p.x);
  float wedge = TAU / ${C.KALEIDO_SEGMENTS};
  theta = mod(theta, wedge);
  theta = abs(theta - wedge * 0.5);
  return vec2(cos(theta), sin(theta)) * r;
}

float tunnelField(vec2 p, float t) {
  float r = max(1e-6, length(p));
  float theta = atan(p.y, p.x);
  float u = log(r) * ${C.TUNNEL_BANDS} - t * ${C.TUNNEL_SPEED};
  float v = theta * ${C.TUNNEL_SPOKES};
  return sin(u) * cos(v);
}

float phylloField(vec2 p, float t) {
  float rot = t * ${C.PHYLLO_SPIN};
  float cs = cos(rot);
  float sn = sin(rot);
  vec2 q = vec2(p.x * cs + p.y * sn, -p.x * sn + p.y * cs);
  float r = length(q);
  float guess = floor(pow(r / ${C.PHYLLO_SPACING}, 2.0) + 0.5);
  float best = 1e9;
  for (int dn = -3; dn <= 3; dn++) {
    float n = guess + float(dn);
    if (n < 1.0) continue;
    float theta = n * ${C.GOLDEN_ANGLE};
    vec2 seed = vec2(cos(theta), sin(theta)) * ${C.PHYLLO_SPACING} * sqrt(n);
    best = min(best, length(q - seed));
  }
  float cell = ${C.PHYLLO_SPACING} * ${C.PHYLLO_DOT};
  return max(0.0, 1.0 - best / cell);
}

float roseLayer(float r, float theta, float t, float k, float spin, float amp) {
  float breathing = amp * (1.0 + ${C.ROSE_BREATHE} * sin(t * ${C.ROSE_BREATHE_FREQ}));
  float target = breathing * abs(cos(k * (theta + spin * t)));
  float d = abs(r - target);
  float line = exp(-d * d * ${C.ROSE_LINE_SHARP});
  float glow = exp(-d * ${C.ROSE_GLOW_FALL}) * ${C.ROSE_GLOW_GAIN};
  return line + glow;
}

// mode selector — indices match looks.ts FIELD_MODES; the mandala (6)
// and trails (7) are handled upstream because they are multi-color
float field(int mode, vec2 p, float t) {
  if (mode == 0) return spiralField(p, t);
  if (mode == 1) return warpField(p * 1.6, t) * 2.0 - 1.0;
  if (mode == 2) return interferenceField(p, t);
  if (mode == 3) return spiralField(kaleidoFold(p), t * 0.7);
  if (mode == 4) return tunnelField(p, t);
  return phylloField(p, t) * 2.0 - 1.0;
}
`;

// The eye itself. Drawn in "eye space": vUv → p ∈ [-1,1]², the visible
// eye an ellipse of radii (1, EYE_ASPECT). The iris is a circle that
// slides with gaze; the catchlight stays put — that disagreement is
// what makes a flat quad read as a wet ball.
export const EYE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uPhase;
uniform float uLid;
uniform float uPupil;
uniform float uEnergy;
uniform float uPulse;
uniform float uSpeedFrom;
uniform float uSpeedTo;
uniform int uModeFrom;
uniform int uModeTo;
uniform float uLookMix;
uniform float uGrade;
uniform vec2 uGaze;
uniform vec3 uPalA[2];
uniform vec3 uPalB[2];
uniform vec3 uPalC[2];
uniform vec3 uPalD[2];
uniform vec3 uRoseK;
uniform vec3 uRoseSpin;
uniform vec3 uRosePhase;
uniform sampler2D uFeedback;

${COMMON}
${FIELDS}

const float IRIS_R = 0.64;
const float LIMBAL_W = 0.10;

float lidMask(vec2 p, float lid, float edge) {
  float d = length(vec2(p.x, p.y / EYE_ASPECT));
  float rim = clamp((1.0 + edge - d) / edge, 0.0, 1.0);
  float aperture = (1.0 - lid) * EYE_ASPECT;
  return rim * clamp((aperture - abs(p.y)) / edge, 0.0, 1.0);
}

vec3 pal(int idx, float t) {
  return cosPalette(t, uPalA[idx], uPalB[idx], uPalC[idx], uPalD[idx]);
}

// the mandala — three seeded rose-curve layers, neon lines over glow,
// each layer voiced at its own point on the palette
vec3 roseColor(int idx, float r, float theta, float t) {
  vec3 col = vec3(0.0);
  vec3 amps = vec3(${C.ROSE_AMP0}, ${C.ROSE_AMP1}, ${C.ROSE_AMP2});
  for (int i = 0; i < 3; i++) {
    float w = roseLayer(r, theta, t, uRoseK[i], uRoseSpin[i], amps[i]);
    vec3 c = pal(idx, uRosePhase[i] + t * 0.03);
    col += c * w;
  }
  return col;
}

vec3 lookColor(int idx, int mode, float speed, vec2 ip, float r, float theta) {
  float t = uTime * speed + uPhase;
  if (mode == 6) return roseColor(idx, r, theta, t);
  if (mode == 7) {
    vec2 fuv = ip / (IRIS_R * 2.2) + 0.5;
    vec3 fb = texture2D(uFeedback, fuv).rgb;
    return fb * (0.7 + 0.6 * pal(idx, r * 0.4 + t * 0.05));
  }
  float v = field(mode, ip, t);
  float band = v * 0.5 + 0.5;
  // palette driven by field value + a slow radial sweep, so color
  // travels through the iris instead of sitting in rings
  float pt = band * 0.55 + r * 0.35 + t * 0.05;
  vec3 col = pal(idx, pt);
  // iris fibers — fine radial striations modulated by the field
  float fibers = 0.82 + 0.18 * sin(theta * 34.0 + v * 3.0 + t * 0.4);
  return col * fibers * (0.55 + 0.45 * band);
}

// the grade — Inscryption's trick: darks snap to a coarse grid, the
// highlights stay free, so shadows go hard while light stays alive
vec3 grade(vec3 col, vec2 p) {
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 snapped = floor(col * ${C.GRADE_LEVELS} + 0.5) / ${C.GRADE_LEVELS};
  float m = smoothstep(${C.GRADE_CUTOFF} - ${C.GRADE_SOFT}, ${C.GRADE_CUTOFF} + ${C.GRADE_SOFT}, l);
  vec3 hard = mix(snapped, col, m);
  // ordered-ish dither so the quantized darks never band statically
  hard += (hash2(p * 217.0 + uTime) - 0.5) * 0.012;
  return mix(col, hard, uGrade);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;

  float mask = lidMask(p, uLid, 0.07);
  if (mask <= 0.001) discard;

  // wet-lens bulge: coordinates compress toward the rim
  float rr = dot(p, p);
  vec2 pb = p * (1.0 + 0.12 * rr);

  // iris center slides with gaze
  vec2 ic = pb - uGaze;
  float r = length(ic);
  float theta = atan(ic.y, ic.x);

  float pupilR = uPupil;
  float irisEdge = smoothstep(IRIS_R, IRIS_R - 0.03, r);
  float pupilEdge = smoothstep(pupilR, pupilR + 0.025, r);

  // sclera — void-dark violet breathing faintly, never white
  float haloT = uTime * 0.4 + uPhase;
  float breathe = 0.06 + 0.03 * sin(haloT);
  vec3 sclera = vec3(0.10, 0.05, 0.22) * (1.0 - smoothstep(0.3, 1.05, r)) +
    vec3(0.30, 0.16, 0.55) * breathe;

  // iris — two looks crossfaded
  vec3 irisA = lookColor(0, uModeFrom, uSpeedFrom, ic, r, theta);
  vec3 irisB = lookColor(1, uModeTo, uSpeedTo, ic, r, theta);
  vec3 iris = mix(irisA, irisB, uLookMix) * uEnergy;

  // limbal ring — the dark rim that makes it an eye and not a disc
  float limbal = 1.0 - 0.75 * smoothstep(IRIS_R - LIMBAL_W, IRIS_R, r) * irisEdge;

  vec3 col = mix(sclera, iris * limbal, irisEdge);

  // pupil — black well with a thin palette-colored inner glow
  vec3 pupilGlow = mix(irisA, irisB, uLookMix) * 0.6;
  float innerRing = smoothstep(pupilR + 0.05, pupilR, r) * pupilEdge;
  col = mix(vec3(0.012, 0.004, 0.03) + pupilGlow * innerRing * 0.35, col, pupilEdge);

  // the subtitle pulse — a fast shimmer that decays upstream
  col *= 1.0 + uPulse * 0.35 * sin(uTime * 22.0);

  // catchlight — fixed to the eye, not the gaze
  float cl = exp(-120.0 * dot(pb - vec2(-0.22, 0.26), pb - vec2(-0.22, 0.26)));
  col += vec3(1.0, 0.97, 0.92) * cl * 0.9;

  // wet dome shading
  col *= 0.82 + 0.30 * (1.0 - rr * 0.55);

  col = grade(col, p);

  gl_FragColor = vec4(col, mask);
}
`;

// The feedback loop — MilkDrop's engine in one pass. Samples the
// previous frame through the AVS "Swirl To Center" polar remap,
// decays it, hue-rotates the trails so they rainbow instead of grey,
// stamps the active field's crest-lines as fresh ink, and dithers so
// the symmetry never locks into a limit cycle.
export const FEEDBACK_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D uPrev;
uniform float uTime;
uniform float uSpeed;
uniform int uMode;
uniform vec3 uPalA[2];
uniform vec3 uPalB[2];
uniform vec3 uPalC[2];
uniform vec3 uPalD[2];

${COMMON}
${FIELDS}

vec3 hueRotate(vec3 c, float a) {
  const vec3 w = vec3(0.299, 0.587, 0.114);
  float cs = cos(a);
  float sn = sin(a);
  return vec3(dot(c, w)) + (c - vec3(dot(c, w))) * cs +
    cross(vec3(0.57735), c) * sn;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;

  // the remap — src coords for the previous frame
  float d = length(p);
  float r = atan(p.y, p.x);
  float d2 = d * (${C.FB_SWIRL_BASE} + cos((r - 1.5707963) * ${C.FB_SWIRL_LOBES}) * ${C.FB_SWIRL_GAIN});
  float r2 = r + ${C.FB_TWIST_AMP} * sin(d * 12.566371);
  vec2 src = vec2(cos(r2), sin(r2)) * d2 * 0.5 + 0.5;
  src += (vec2(hash2(p * 91.0 + uTime), hash2(p * 57.0 - uTime)) - 0.5) * ${C.FB_DITHER};

  vec3 prev = texture2D(uPrev, src).rgb * ${C.FB_DECAY};
  prev = hueRotate(prev, ${C.FB_HUE_STEP} * TAU);

  // fresh ink — the active field's crests, palette-colored
  float t = uTime * uSpeed;
  float v = field(uMode, p, t);
  float crest = smoothstep(0.5, 0.92, v);
  vec3 ink = cosPalette(v * 0.4 + t * 0.06, uPalA[0], uPalB[0], uPalC[0], uPalD[0]) * crest;

  // darken_center discipline — feedback zoom burns out its attractor
  float center = smoothstep(0.0, 0.25, d);
  vec3 col = max(prev * mix(0.9, 1.0, center), ink);

  gl_FragColor = vec4(col, 1.0);
}
`;

// The membrane — the tissue that attaches the two eyes. A wide quad
// behind the pair: a soft glow lobe per eye, a vesica bridge where
// the lobes overlap, fbm mist drifting through. Additive, faint.
export const MEMBRANE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uEnergy;
uniform vec2 uEyeL;
uniform vec2 uEyeR;
uniform vec3 uPalA[2];
uniform vec3 uPalB[2];
uniform vec3 uPalC[2];
uniform vec3 uPalD[2];
uniform float uLookMix;

${COMMON}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float dl = length((p - uEyeL) * vec2(1.0, 1.6));
  float dr = length((p - uEyeR) * vec2(1.0, 1.6));

  float lobes = exp(-4.5 * dl * dl) + exp(-4.5 * dr * dr);
  // the bridge: strong only where BOTH lobes still glow
  float bridge = exp(-3.2 * dl * dl) * exp(-3.2 * dr * dr) * 5.0;

  float mist = fbm(p * 2.3 + vec2(uTime * 0.05, -uTime * 0.03));
  float glow = (lobes * 0.35 + bridge * 0.65) * (0.55 + 0.45 * mist) * uEnergy;

  float pt = 0.5 + p.x * 0.12 + uTime * 0.02;
  vec3 colA = cosPalette(pt, uPalA[0], uPalB[0], uPalC[0], uPalD[0]);
  vec3 colB = cosPalette(pt, uPalA[1], uPalB[1], uPalC[1], uPalD[1]);
  vec3 col = mix(colA, colB, uLookMix) * glow;

  gl_FragColor = vec4(col, glow);
}
`;
