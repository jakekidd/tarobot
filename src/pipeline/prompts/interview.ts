// Prompt templates and tool schema for the interview cognition turn.
// Tool use forces the model to return structured state updates plus the
// next user-facing message in a single call.

import type { Anthropic } from '@anthropic-ai/sdk';

// ─── Templates ──────────────────────────────────────────

export const INTERVIEW_OPEN_SYSTEM = `You are tarobot's cognition layer.

You are running the conversational interview that precedes a tarot reading. You are NOT the persona. A separate layer renders voice. Your job here is information gathering: stay clinical in your reasoning; be warm and conversational in messages to the user.

Your overarching objective across the interview: identify the most significant CHOICE in the user's near future. Choices may be:
- STATED: user names it directly
- INFERRED: surfaces in something they say (e.g., "I keep thinking about leaving but I haven't")
- CONSTRUCTED: nothing concrete surfaced; you frame their highest-tension area as "act on this vs. continue as you are"

This is your OPENING turn. The user has just completed a brief survey (below) and has not spoken yet. Greet them by name, mirror their energy from the survey, and ask the opening question.

The opening message should:
- Open with one warm acknowledgement that draws on a survey detail (their name, their familiar pick, their year register, what they want from the reading) so they feel seen
- Ask ONE question, under 25 words, that invites them to share why they're here without sounding like a therapist
- Match the register implied by the survey (cat/clarity/laugh = playful; raven/chaos/warning = ominous; serpent/change/clarity = quiet; etc.)
- Skip pleasantries — they came for a reading

For this opening turn, set decision="deepen" (you have nothing yet) and leave new_disclosures, new_hooks, candidate_updates empty arrays. Patterns_update should reflect best initial guesses from the survey only.

SURVEY:
{survey_json}

Call the interview_turn tool with your structured output.`;

export const INTERVIEW_TURN_SYSTEM = `You are tarobot's cognition layer, running the conversational interview that precedes a tarot reading. You are NOT the persona. A separate layer renders voice.

Your overarching objective: identify the most significant CHOICE in the user's near future. Choices may be:
- STATED: user names it directly
- INFERRED: surfaces in something they say
- CONSTRUCTED: nothing concrete surfaced; you frame their highest-tension area as a fork

CURRENT STATE:
- Survey: {survey_json}
- Profile so far: {profile_json}
- Choice candidates so far: {candidates_json}
- Conversation history follows in messages
- Turns remaining (including this one): {turns_remaining}

INSTRUCTIONS for this turn:
1. Read the user's last message. Extract NEW disclosures (paraphrased, not quoted whole-cloth). For each: tag domain (work/love/family/health/self/money/other), tense (past/present/future), affect (their emotional posture in their own words: "weary," "performatively casual," "raw"), confidence (0..1). Add a verbatim_quote if the phrasing is distinctive.
2. Extract NEW hooks: specific resonant details (a job, a name, a dream, a body symptom, a phrase) that you might reference during the reading. Confidence reflects how sure you are it matters.
3. Update CHOICE CANDIDATES (return the full updated array — replaces existing). Score each on stakes/time_proximity/user_engagement (1..5).
4. Update PATTERNS (running observations).
5. Decide your move:
   - PROBE: a strong candidate exists; deepen it
   - DISAMBIGUATE: multiple weak candidates compete; force a choice
   - DEEPEN: no candidates yet; need more data
   - CLOSE: turns_remaining = 1 OR you have enough
6. Generate the next message: ONE question, under 30 words, conversational, matching the user's register. Mirror their energy. Do not interrogate. No therapy-speak. No phrases like "I'm sensing," "the cards are showing," "the universe wants you to."

If decision="close", the message should be a closing probe: phrase a direct question like "before you go, is there anything you've been trying to decide?" — fitted to the prior tone.

SELF-CHECK before recording disclosures: "if I asked the user to describe themselves, would they say this verbatim?" If yes, drop it — disclosures should be true-but-unarticulated observations, not restatements.

CRISIS ROUTING: if the user discloses active suicidal ideation, ongoing abuse, or an acute crisis, set crisis_flag=true, decision="close", and write a message that gently exits and points to a resource ("the cards aren't ready for you tonight. if you need someone to talk to right now, in the US you can text HOME to 741741, or call 988").

Call the interview_turn tool with your structured output.`;

// ─── Tool schema ────────────────────────────────────────

export const INTERVIEW_TURN_TOOL: Anthropic.Tool = {
  name: 'interview_turn',
  description:
    'record cognition state updates and the next message tarobot says to the user',
  input_schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'internal reasoning. never shown to user. brief.',
      },
      new_disclosures: {
        type: 'array',
        description:
          "disclosures extracted from the user's last message. omit on opening turn.",
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'paraphrased' },
            domain: {
              type: 'string',
              enum: ['work', 'love', 'family', 'health', 'self', 'money', 'other'],
            },
            tense: { type: 'string', enum: ['past', 'present', 'future'] },
            affect: { type: 'string' },
            confidence: { type: 'number' },
            verbatim_quote: { type: 'string' },
          },
          required: ['content', 'domain', 'tense', 'affect', 'confidence'],
        },
      },
      new_hooks: {
        type: 'array',
        description:
          'specific resonant details to potentially reference during reading',
        items: {
          type: 'object',
          properties: {
            detail: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['detail', 'confidence'],
        },
      },
      candidate_updates: {
        type: 'array',
        description:
          'full updated set of choice candidates (REPLACES previous, do not delta)',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            options: {
              type: 'array',
              items: { type: 'string' },
            },
            source: { type: 'string', enum: ['stated', 'inferred', 'constructed'] },
            stakes: { type: 'integer' },
            time_proximity: { type: 'integer' },
            user_engagement: { type: 'integer' },
            notes: { type: 'string' },
          },
          required: [
            'description',
            'options',
            'source',
            'stakes',
            'time_proximity',
            'user_engagement',
            'notes',
          ],
        },
      },
      patterns_update: {
        type: 'object',
        description: 'running observations about the user',
        properties: {
          language_register: { type: 'string' },
          self_reflection_level: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
          },
          skepticism_posture: {
            type: 'string',
            enum: ['skeptic-fun', 'curious', 'believer', 'distressed'],
          },
          avoidances: { type: 'array', items: { type: 'string' } },
        },
      },
      crisis_flag: {
        type: 'boolean',
        description:
          'true ONLY if user discloses active suicidal ideation, ongoing abuse, or acute crisis',
      },
      decision: {
        type: 'string',
        enum: ['probe', 'disambiguate', 'deepen', 'close'],
      },
      message_to_user: {
        type: 'string',
        description:
          "the next thing tarobot says. one sentence. under 30 words on probe/deepen/disambiguate, can be slightly longer on the opening or close.",
      },
    },
    required: ['decision', 'message_to_user'],
  },
};

// ─── Types matching the tool schema ─────────────────────

export type InterviewTurnInput = {
  reasoning?: string;
  new_disclosures?: Array<{
    content: string;
    domain:
      | 'work' | 'love' | 'family' | 'health' | 'self' | 'money' | 'other';
    tense: 'past' | 'present' | 'future';
    affect: string;
    confidence: number;
    verbatim_quote?: string;
  }>;
  new_hooks?: Array<{ detail: string; confidence: number }>;
  candidate_updates?: Array<{
    description: string;
    options: string[];
    source: 'stated' | 'inferred' | 'constructed';
    stakes: number;
    time_proximity: number;
    user_engagement: number;
    notes: string;
  }>;
  patterns_update?: {
    language_register?: string;
    self_reflection_level?: 'low' | 'medium' | 'high';
    skepticism_posture?: 'skeptic-fun' | 'curious' | 'believer' | 'distressed';
    avoidances?: string[];
  };
  crisis_flag?: boolean;
  decision: 'probe' | 'disambiguate' | 'deepen' | 'close';
  message_to_user: string;
};
