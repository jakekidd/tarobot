// Compiler agent — v3.2 close-pass anchor writer. Public surface.
//
// Runs once at survey close. Reads the curated hypothesis list +
// history + verbatim log + anchor template, identifies the resolved
// Dilemma, and writes the prose anchor narrowly around it.

export { runCompiler } from './agent';
export {
  CompilerOutputSchema,
  type CompilerOutput,
} from './schema';
export { COMPILER_SYSTEM, COMPILER_TOOL } from './prompt';
export { buildCompilerPayload, type CompilerPayloadArgs } from './payload';
