import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient } from './claude';
import { MODELS } from './claude';
import { getPersona, type PersonaId } from './personas';
import { READING_SYSTEM, READING_TOOL, type ReadingInput } from './prompts/reading';
import type {
  Chapter,
  DrawnCards,
  EnrichedProfile,
  Reading,
} from './types';

/**
 * Construct the full reading in a single Claude call.
 */
export async function constructReading(
  client: ClaudeClient,
  profile: EnrichedProfile,
  drawn: DrawnCards,
  personaId?: PersonaId,
): Promise<Reading> {
  const persona = getPersona(personaId);

  const cardLines = drawn.cards
    .map(
      ({ position, card }) =>
        `  ${position.id.toUpperCase()} (${position.role}): ${card.name} — ${card.upright_meaning}`,
    )
    .join('\n');

  const positionBriefs = drawn.spread.positions
    .map((p) => `  - ${p.prompt_label}`)
    .join('\n');

  const sys = READING_SYSTEM
    .replace('{persona_brief}', persona.voice_brief)
    .replace('{persona_example}', persona.example_line)
    .replace('{persona_closing}', persona.closing_register)
    .replace('{spread_name}', drawn.spread.name)
    .replace('{spread_description}', drawn.spread.description)
    .replace('{position_briefs}', positionBriefs)
    .replace('{profile_json}', JSON.stringify(profile, null, 2))
    .replace('{choice_json}', JSON.stringify(profile.target_choice, null, 2))
    .replace('{card_lines}', cardLines);

  const response = await client.messages.create({
    model: MODELS.COGNITION,
    max_tokens: 6000,
    system: sys,
    tools: [READING_TOOL],
    tool_choice: { type: 'tool', name: 'construct_reading' },
    messages: [
      {
        role: 'user',
        content:
          'construct the reading. follow the process. produce one chapter per position in order.',
      },
    ],
  });

  const args = readToolUse<ReadingInput>(response, 'construct_reading');
  return validateAndCoerceReading(args, drawn);
}

// ─── Helpers ────────────────────────────────────────────

function validateAndCoerceReading(args: ReadingInput, drawn: DrawnCards): Reading {
  const expectedIds = drawn.spread.positions.map((p) => p.id);
  const byPosition = new Map<string, ReadingInput['chapters'][number]>();
  for (const ch of args.chapters) byPosition.set(ch.position_id, ch);

  const chapters: Chapter[] = expectedIds.map((pid) => {
    const ch = byPosition.get(pid);
    if (!ch) {
      throw new Error(`reading is missing chapter for position "${pid}"`);
    }
    return {
      position_id: ch.position_id,
      card_id: ch.card_id,
      role_in_arc: ch.role_in_arc,
      hooks_used: ch.hooks_used ?? [],
      prediction: ch.prediction,
      spoken_text: ch.spoken_text,
    };
  });

  return {
    theme: args.theme,
    arc: args.arc,
    chapters,
    closing_text: args.closing_text,
  };
}

function readToolUse<T>(
  response: Anthropic.Message,
  expectedName: string,
): T {
  const block = response.content.find(
    (b) => b.type === 'tool_use' && b.name === expectedName,
  );
  if (!block || block.type !== 'tool_use') {
    throw new Error(
      `cognition did not call the ${expectedName} tool (stop_reason=${response.stop_reason})`,
    );
  }
  return block.input as T;
}
