// Agent call wrappers — every model call in the ensemble goes through
// here: streamed (tool calls via onToolInput, freeform via onChunk) and
// telemetry-wrapped, so the lab sees every prompt exactly as the model
// saw it and every output as it generates.

import type { ZodType } from 'zod';
import type { LLMAdapter, ToolDef } from '../llm/adapter';
import type {
  AgentName,
  Bit,
  CallRecord,
  EnsembleTelemetry,
  Fact,
  Intent,
  PersonaLine,
  PileItem,
  Prediction,
  Question,
  Read,
  Thought,
} from './types';
import {
  BIT_TOOL,
  DRIVER_TOOL,
  FACTS_TOOL,
  PERSONA_TOOL,
  PREDICTION_TOOL,
  QUESTIONS_TOOL,
  READ_TOOL,
  SYSTEMS,
  THOUGHTS_TOOL,
  VERDICT_TOOL,
} from './prompts';
import {
  BitSchema,
  FactsSchema,
  IntentSchema,
  PersonaLineSchema,
  PredictionSchema,
  QuestionsSchema,
  ReadSchema,
  ThoughtsSchema,
  VerdictSchema,
} from './schemas';

export type AgentEnv = {
  adapter: LLMAdapter;
  telemetry?: EnsembleTelemetry;
  tiers: Record<AgentName, 'fast' | 'cognition' | 'deep'>;
};

export const DEFAULT_TIERS: Record<AgentName, 'fast' | 'cognition' | 'deep'> = {
  driver: 'cognition',
  persona: 'cognition',
  attention: 'cognition',
  interpreter: 'fast',
  psychic: 'fast',
  detective: 'fast',
  beholder: 'fast',
  joker: 'fast',
  cassandra: 'fast',
  judge: 'fast',
};

let nextCallId = 1;
function callId(): string {
  return `c-${nextCallId++}`;
}

async function structured<T>(
  env: AgentEnv,
  agent: AgentName,
  system: string,
  user: string,
  tool: ToolDef,
  schema: ZodType<T>,
  maxTokens: number,
): Promise<T> {
  const id = callId();
  const tier = env.tiers[agent];
  const rec: CallRecord = {
    id,
    agent,
    tier,
    system,
    user,
    startedAt: Date.now(),
    streamed: '',
  };
  env.telemetry?.onCallStart?.(rec);
  try {
    const out = await env.adapter.invokeStreaming(
      {
        system,
        user,
        tool,
        model: tier,
        max_tokens: maxTokens,
        onToolInput: (chunk) => env.telemetry?.onCallChunk?.(id, chunk),
      },
      schema,
    );
    env.telemetry?.onCallEnd?.(id, out);
    return out;
  } catch (e) {
    env.telemetry?.onCallError?.(id, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

async function freeform(
  env: AgentEnv,
  agent: AgentName,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const id = callId();
  const tier = env.tiers[agent];
  const rec: CallRecord = {
    id,
    agent,
    tier,
    system,
    user,
    startedAt: Date.now(),
    streamed: '',
  };
  env.telemetry?.onCallStart?.(rec);
  try {
    const out = await env.adapter.invokeFreeformStreaming({
      system,
      user,
      model: tier,
      max_tokens: maxTokens,
      label: `ensemble_${agent}`,
      onChunk: (chunk) => env.telemetry?.onCallChunk?.(id, chunk),
    });
    env.telemetry?.onCallEnd?.(id, out);
    return out;
  } catch (e) {
    env.telemetry?.onCallError?.(id, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

// ------------------------------------------------------------ behavior

export type DriverPayload = {
  mode: string;
  docs: string;
  frame: string;
  conversation: string;
  cognition: string;
  goals: string;
  economy: string;
  stallState: string;
  event: string;
  taboos: string;
};

export function callDriver(env: AgentEnv, p: DriverPayload): Promise<Intent> {
  const user = [
    `MODE: ${p.mode}`,
    `TABOOS: ${p.taboos}`,
    `DOCS:\n${p.docs}`,
    `FRAME:\n${p.frame}`,
    `CONVERSATION (recent):\n${p.conversation}`,
    `COGNITION:\n${p.cognition}`,
    `GOALS:\n${p.goals}`,
    `ECONOMY: ${p.economy}`,
    `STALL_STATE: ${p.stallState}`,
    `EVENT: ${p.event}`,
  ].join('\n\n');
  return structured(env, 'driver', SYSTEMS.driver, user, DRIVER_TOOL, IntentSchema, 700);
}

export type PersonaPayload = {
  /** full session beats, verbatim — the append-only cached prefix */
  conversation: string;
  frame: string;
  bit: string | null;
  assignment: string;
};

export function callPersona(env: AgentEnv, p: PersonaPayload): Promise<PersonaLine> {
  const sections = [`[the conversation so far]\n${p.conversation}`, `[your orientation]\n${p.frame}`];
  if (p.bit) sections.push(`[a bit in your pocket, playable or not]\n${p.bit}`);
  sections.push(`[the intent]\n${p.assignment}`);
  return structured(
    env,
    'persona',
    SYSTEMS.wildcard,
    sections.join('\n\n'),
    PERSONA_TOOL,
    PersonaLineSchema,
    600,
  );
}

// ------------------------------------------------------------ cognition

type FanPayload = {
  conversation: string;
  ownTail: string;
  frame?: string;
};

function fanUser(p: FanPayload): string {
  const sections = [`CONVERSATION (newest visitor material marked NEW):\n${p.conversation}`];
  if (p.frame) sections.push(`ORACLE'S CURRENT FRAME:\n${p.frame}`);
  sections.push(`YOUR RECENT FILINGS:\n${p.ownTail}`);
  return sections.join('\n\n');
}

export function callInterpreter(env: AgentEnv, p: FanPayload): Promise<Read> {
  return structured(env, 'interpreter', SYSTEMS.interpreter, fanUser(p), READ_TOOL, ReadSchema, 600);
}

export type ThoughtFiling = { thought: string; confidence: 1 | 2 | 3; refreshes?: string };

export async function callPsychic(env: AgentEnv, p: FanPayload): Promise<ThoughtFiling[]> {
  const out = await structured(
    env,
    'psychic',
    SYSTEMS.psychic,
    fanUser(p),
    THOUGHTS_TOOL,
    ThoughtsSchema,
    500,
  );
  return out.thoughts;
}

export type QuestionsFiling = {
  open: { question: string; refreshes?: string }[];
  answered: { question: string; answer: string }[];
};

export function callDetective(env: AgentEnv, p: FanPayload): Promise<QuestionsFiling> {
  return structured(
    env,
    'detective',
    SYSTEMS.detective,
    fanUser(p),
    QUESTIONS_TOOL,
    QuestionsSchema,
    500,
  );
}

export async function callBeholder(env: AgentEnv, p: FanPayload): Promise<Fact[]> {
  const out = await structured(
    env,
    'beholder',
    SYSTEMS.beholder,
    fanUser(p),
    FACTS_TOOL,
    FactsSchema,
    500,
  );
  return out.facts;
}

export async function callJoker(env: AgentEnv, p: FanPayload): Promise<Bit | null> {
  const out = await structured(env, 'joker', SYSTEMS.joker, fanUser(p), BIT_TOOL, BitSchema, 400);
  return out.bit;
}

export function callCassandra(env: AgentEnv, p: FanPayload): Promise<Prediction> {
  return structured(
    env,
    'cassandra',
    SYSTEMS.cassandra,
    fanUser(p),
    PREDICTION_TOOL,
    PredictionSchema,
    300,
  );
}

export async function callJudge(
  env: AgentEnv,
  prediction: Prediction,
  actual: string,
): Promise<'hit' | 'graze' | 'miss'> {
  const user = [
    `PREDICTION: ${JSON.stringify({ gist: prediction.gist, opening: prediction.opening })}`,
    `ACTUAL: ${actual}`,
  ].join('\n');
  const out = await structured(env, 'judge', SYSTEMS.judge, user, VERDICT_TOOL, VerdictSchema, 100);
  return out.verdict;
}

export type AttentionPayload = {
  docs: string;
  brief: string;
  taboos: string;
  conversation: string;
  piles: string;
  frame: string;
  trigger: string;
};

export function callAttention(env: AgentEnv, p: AttentionPayload): Promise<string> {
  const user = [
    `INPUT DOCS:\n${p.docs}`,
    `BRIEF:\n${p.brief}`,
    `TABOOS: ${p.taboos}`,
    `CONVERSATION:\n${p.conversation}`,
    `COGNITION PILES:\n${p.piles}`,
    `CURRENT FRAME:\n${p.frame}`,
    `TRIGGER: ${p.trigger}`,
  ].join('\n\n');
  return freeform(env, 'attention', SYSTEMS.attention, user, 800);
}

// ------------------------------------------------------------ renderers

export function renderDocs(docs: { name: string; md: string }[]): string {
  if (docs.length === 0) return '(no documents)';
  return docs.map((d) => `<<< document: ${d.name} >>>\n${d.md}\n<<< end >>>`).join('\n\n');
}

export function renderTail<P>(
  items: PileItem<P>[],
  fmt: (payload: P) => string,
): string {
  if (items.length === 0) return '(nothing yet)';
  return items.map((i) => `[${i.id}] ${fmt(i.payload)}`).join('\n');
}

export function fmtRead(r: Read): string {
  const feelings = r.feelings
    .map((f) => `${f.emotion}${f.toward ? ` -> ${f.toward}` : ''} (${f.because})`)
    .join('; ');
  const thoughts = r.thoughts.map((t) => `"${t}"`).join(' ');
  return `expressing: ${r.expressing}${thoughts ? ` | thinking: ${thoughts}` : ''}${feelings ? ` | feeling: ${feelings}` : ''}${r.behavior ? ` | heading: ${r.behavior}` : ''} | cue: ${r.cue}`;
}

export function fmtThought(t: Thought): string {
  return `"${t.thought}" (confidence ${t.confidence})`;
}

export function fmtQuestion(q: Question): string {
  return q.status === 'answered' ? `${q.question} -> ${q.answer}` : q.question;
}

export function fmtFact(f: Fact): string {
  return `${f.kind}: ${f.label} — ${f.note}`;
}
