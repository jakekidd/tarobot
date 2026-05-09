import type { ClaudeClient } from './claude';
import type { DrawnCards, EnrichedProfile, Reading } from './types';

/**
 * Construct the full reading in a single Claude call.
 * Produces theme + arc + chapters (one per spread position) + closing.
 *
 * Each chapter has both a clinical `prediction` and a persona-voiced
 * `spoken_text`. MVP: same call writes both. Production: persona layer
 * may be split out.
 *
 * Implemented during the cognition pipeline phase.
 */
export async function constructReading(
  _client: ClaudeClient,
  _profile: EnrichedProfile,
  _drawn: DrawnCards,
): Promise<Reading> {
  throw new Error('constructReading: not yet implemented');
}
