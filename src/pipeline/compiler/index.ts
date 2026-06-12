// Public surface of the Compiler — the stage between the antechamber
// (AntechamberOutput) and the reading (CompiledBrief → Seer). Naive v1:
// deal + one narrative call + honest profile assembly. The in-depth
// compiler (experts, Augur, the Cheat) replaces compile()'s internals
// without moving this seam.

export { compile } from './compile';
export type { CompiledBrief } from './types';
