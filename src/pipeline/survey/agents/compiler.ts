// Compiler agent — one-shot at survey close. Calls the LLM ONLY for the
// synthesis fields (prose brief, openers, brief summary). The engine maps
// the rest of the legacy Profile from EngineState deterministically.

import type { LLMAdapter } from '../adapter';
import { CompilerLLMOutputSchema } from '../schemas';
import { COMPILER_SYSTEM, COMPILER_TOOL } from '../prompts/compiler';
import type {
  CompilerInput,
  CompilerLLMOutput,
  CompilerOutput,
} from '../types';
import { assembleProfile } from '../profile-assembly';

export async function runCompiler(
  adapter: LLMAdapter,
  input: CompilerInput,
): Promise<CompilerOutput> {
  // Build a compressed view of the final state for the LLM. We send what's
  // useful for prose synthesis; we DON'T send raw timing logs / pick logs
  // bloating the prompt.
  const s = input.state;
  const userPayload = {
    chosen_intention: input.chosen_intention,
    final_state_summary: {
      session_id: s.session_id,
      tree_version: s.tree_version,
      identity: {
        name: s.profile.name,
        sun_sign: s.profile.sun_sign,
        life_path: s.profile.life_path,
        birth_card: s.profile.birth_card,
        age_bracket: s.profile.age_bracket,
        birth_time_bracket: s.profile.birth_time_bracket,
        has_question_mode: s.profile.has_question_mode,
      },
      choice_draft: s.investigation.choice_draft,
      cast: s.profile.cast,
      contradictions: s.investigation.contradictions,
      hooks: s.investigation.hooks,
      sections: s.profile.sections,
      posture: s.investigation.posture,
      hypotheses: s.investigation.hypotheses,
      active_threads: s.investigation.active_threads,
      picks_log: s.picks_log,
      close_reason: s.close_reason,
    },
    instruction:
      'the chosen_intention is the centerpiece. render brief_summary + prose_brief (orbiting that intention) + 3 opener questions for the seer tailored to that intention. legacy Profile assembly happens engine-side.',
  };

  const llmOut = await adapter.invoke<CompilerLLMOutput>(
    {
      system: COMPILER_SYSTEM,
      user: JSON.stringify(userPayload, null, 2),
      tool: COMPILER_TOOL,
      model: 'deep',
      max_tokens: 4000,
    },
    CompilerLLMOutputSchema,
  );

  const profile = assembleProfile(s, llmOut.brief_summary);

  return {
    profile,
    openers: llmOut.openers,
    prose_brief: llmOut.prose_brief,
  };
}
