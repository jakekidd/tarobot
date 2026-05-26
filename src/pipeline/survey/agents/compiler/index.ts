// Compiler agent (sieve) — public surface.
//
// Runs once per session, AFTER the user submits their intention.
// Reads the unified transcript + WEAVER candidates + user_intention
// and produces the DilemmaDocument the seer consumes. The engine
// renders it to a markdown anchor for storage + debug + legacy
// Seer profile path.

export { runCompiler } from './agent';
export {
  CompilerOutputSchema,
  DilemmaDocumentSchema,
  type CompilerOutput,
  type DilemmaDocument,
  type CriticalHypothesis,
  type DomainTag,
  type ResolutionPath,
  type Awareness,
  type Confidence,
} from './schema';
export { COMPILER_SYSTEM, COMPILER_TOOL } from './prompt';
export { buildCompilerPayload, type CompilerPayloadArgs } from './payload';
export { renderDilemmaAsAnchor } from './render';
