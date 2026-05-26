// Seeder agent — public surface.
//
// Replaces the v3.2 Profiler hypothesis curator. The Seeder produces
// free-form notes (plain text, no structure) that get appended to a
// per-session list. The Detective reads them as ideas to consider, not
// as hypotheses to test. The Compiler at close reads the full note
// list when writing the anchor.

export { runSeeder } from './agent';
export { SeederOutputSchema, type SeederOutput } from './schema';
export { SEEDER_SYSTEM, SEEDER_TOOL } from './prompt';
export { buildSeederPayload, type SeederPayloadArgs } from './payload';
