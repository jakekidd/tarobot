// Pipeline audit page.
//
// One scrollable canvas with two sections (SurveyEngine and SeerEngine).
// Each section: a Mermaid flowchart at the top showing structure (with
// I/O type names on the edges), then per-agent detail cards below with
// the prompt text pulled LIVE from the source files.
//
// Runtime categorization (the load-bearing axis):
//   - local : observer / detective / interrogator + all seer actor agents
//             — designated to run on a local OSS LLM on the booth's
//             on-prem computer in prod. Today fulfilled by Claude.
//   - cloud : shaman / augur + all seer director agents — stays cloud
//             in prod (Anthropic API). Latency tolerable because the
//             one-shot ones (shaman, augur) run at survey close, and
//             the seer director runs in parallel with the actor's voice.
//
// User-action nodes (where the human in front of the booth participates)
// are colored red so the page reads at a glance: who is responsible for
// progress at each step.

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// ── Live config imports (so this page reflects engine constants) ──

import { STARTER_SEED_COUNT } from '../pipeline/survey';

// ── Live prompt imports ─────────────────────────────────────

import { SEEDER_SYSTEM_TEMPLATE } from '../pipeline/survey/agents/seeder';
import { DETECTIVE_SYSTEM_TEMPLATE } from '../pipeline/survey/agents/detective';
import { PSYCH_SYSTEM_TEMPLATE } from '../pipeline/survey/agents/psych';
import INTENTION_SUGGESTOR_RAW from '../../materials/prompts/intention-suggestor.md?raw';
import {
  AUGUR_OUTLINE_SYSTEM,
  AUGUR_OUTLINE_TOOL,
  AUGUR_FILL_SYSTEM,
} from '../pipeline/survey/agents/augur';
import { MANTRA_SYSTEM } from '../pipeline/seer/mantra';

import {
  PER_CARD_DIRECTOR_SYSTEM,
  PER_CARD_DIRECTOR_TOOL,
  CLOSING_DIRECTOR_SYSTEM,
  CLOSING_DIRECTOR_TOOL,
  INTRO_DIRECTOR_SYSTEM,
  INTRO_DIRECTOR_TOOL,
} from '../pipeline/seer/prompts/director';
import {
  buildPerCardActorSystem,
  PER_CARD_ACTOR_TOOL,
  buildIntroActorSystem,
  INTRO_ACTOR_TOOL,
  buildClosingActorSystem,
  CLOSING_ACTOR_TOOL,
  buildChatActorSystem,
  CHAT_ACTOR_TOOL,
} from '../pipeline/seer/prompts/actor';
import { getActor } from '../pipeline/seer/actors';

// The pipeline inspector renders the system prompt for the DEFAULT actor.
// (If you add an actor selector to the inspector, derive these per-row
// from the selection instead.)
const DEFAULT_ACTOR = getActor();
const PER_CARD_ACTOR_SYSTEM = buildPerCardActorSystem(DEFAULT_ACTOR);
const INTRO_ACTOR_SYSTEM = buildIntroActorSystem(DEFAULT_ACTOR);
const CLOSING_ACTOR_SYSTEM = buildClosingActorSystem(DEFAULT_ACTOR);
const CHAT_ACTOR_SYSTEM = buildChatActorSystem(DEFAULT_ACTOR);

// ── Agent metadata ──────────────────────────────────────────

type AgentRuntime = 'local' | 'cloud';

type AgentSpec = {
  id: string;
  name: string;
  runtime: AgentRuntime;
  call_pattern: string;
  input_type: string;
  output_type: string;
  inputs: string;
  outputs: string;
  prompt: string;
  tool_name?: string;
  notes?: string;
};

const SURVEY_AGENTS: AgentSpec[] = [
  {
    id: 'seeder',
    name: 'Algorithmic Seeder',
    runtime: 'local',
    call_pattern: 'synchronous, deterministic — fires before every post-opener pipeline. No LLM call. Reads the answered node\'s Inversions probe and drops hypothesis seeds into investigation.hypotheses.tentative[].',
    input_type: 'TreeNode + answer + turn_n',
    output_type: 'Hypothesis[]',
    inputs: 'answered node (Surface/Inversions/Watch-for probe blocks) + user answer + current turn',
    outputs: 'Hypothesis[] pushed into investigation.hypotheses.tentative[]; ages existing tentative/held items by 1 turn',
    prompt: '(no prompt — pure TypeScript function in src/pipeline/survey/seeder.ts)',
    notes: 'Zero LLM cost. Deterministic. Gives the Observer a board to work with on every turn instead of starting from scratch.',
  },
  {
    id: 'seeder',
    name: 'Seeder',
    runtime: 'cloud',
    call_pattern: 'serial — fires after each PILLAR pick (Phase 2 only). Haiku tier. Reads this turn\'s Q&A in context (options, negative space, inversions decoder) + full history + existing notes. Appends 0-6 short free-form notes to doc.seeder_notes + transcript.',
    input_type: 'SeederInput',
    output_type: 'string[]',
    inputs: 'transcript + this_turn (question, options, picked, skipped, decoder) + verbatim_log',
    outputs: 'plain text — one observation per line, indented',
    prompt: SEEDER_SYSTEM_TEMPLATE,
    tool_name: 'freeform',
    notes: 'Observations only — no hypotheses, no decisions, no forks. Silent during Interrogation. Silence is fine on thin turns.',
  },
  {
    id: 'detective',
    name: 'Detective',
    runtime: 'cloud',
    call_pattern: 'Interrogation phase only. Called repeatedly to refill an assertion queue 3-ahead of the user; latest answer always wins (queue is provisional, not a script).',
    input_type: 'DetectiveInput',
    output_type: 'DetectiveTextBlob',
    inputs: 'transcript (pillar Q&A + seeder obs + assertions + responses) + hypotheses_so_far (re-vote by repetition) + assertion_queue + verbatim_log + detective_thinking_so_far (continuous transcript)',
    outputs: 'free-form thinking, then ===HYPOTHESES===, ===ASSERTION===, ===IF_WARM===, ===IF_COLD===',
    prompt: DETECTIVE_SYSTEM_TEMPLATE,
    tool_name: 'freeform',
    notes: 'Opus, 4K tokens. Hypothesis re-listing = vote. Asserts situation, not interior. WARM/COLD as absolute (COLD eliminates a region, never inverts). Correction text is the gold.',
  },
  {
    id: 'psych',
    name: 'Psych',
    runtime: 'cloud',
    call_pattern: 'Interrogation phase only. Fires every 2 answered assertions (~3 calls across the 6-assertion ceiling). Haiku tier. Background — does not block the detective. Owns the engagement early-out.',
    input_type: 'RunPsychArgs',
    output_type: 'PsychTextBlob',
    inputs: 'transcript + verbatim_log + detective_hypotheses (advisory) + psych_candidates_so_far + run_idx / run_total',
    outputs: 'free-form thinking, then ===CANDIDATES=== (label / description / evidence-anchored thoughts), then ===TERMINATE=== (yes | no)',
    prompt: PSYCH_SYSTEM_TEMPLATE,
    tool_name: 'freeform',
    notes: 'Curates a small set of candidate Dilemmas (situation + fork). Re-listing same label = organic vote. Append-over-add discipline. Terminate fires when no new evidence AND user responses flat — closes the alienation seam.',
  },
  {
    id: 'intention-suggestor',
    name: 'Intention Suggestor',
    runtime: 'cloud',
    call_pattern: 'fires N parallel calls — one per PSYCH candidate — right after the transition to awaiting_intention. Sonnet tier. Cheap because short + parallel; latency hides behind the user reading the intent screen.',
    input_type: '{ state, candidate: PotentialDilemma }',
    output_type: 'string (one short sentence)',
    inputs: 'one PSYCH candidate (label + description + thoughts) + verbatim_log for texture',
    outputs: 'a single first-person sentence the user might plausibly type at the intent screen (rendered as a chip)',
    prompt: INTENTION_SUGGESTOR_RAW,
    tool_name: 'freeform',
    notes: 'Click submits directly — no edit step. Empty for returning users in lite mode (no PSYCH ran).',
  },
  {
    id: 'augur-outline',
    name: 'Augur — Stage 1: Outline',
    runtime: 'cloud',
    call_pattern: 'blocking — once after intention is picked',
    input_type: 'AugurOutlineInput',
    output_type: 'Outcome[] (id + label only)',
    inputs: 'profile + story + intention + survey history (compact)',
    outputs: 'Array<{ id, label }> (2–4 outcomes named)',
    prompt: AUGUR_OUTLINE_SYSTEM,
    tool_name: AUGUR_OUTLINE_TOOL.name,
    notes: 'Decides outcome SHAPE (binary / ternary / open). Outcomes branch off story.fork. Names each outcome. No prose.',
  },
  {
    id: 'augur-fill',
    name: 'Augur — Stage 2: Fill',
    runtime: 'cloud',
    call_pattern: 'parallel fan-out — N invocations (one per outline entry)',
    input_type: 'AugurFillInput',
    output_type: 'string (markdown document)',
    inputs: 'profile + story + intention + survey history + ONE outcome (id + label)',
    outputs: 'string (freely-written markdown; ~2000 tokens)',
    prompt: AUGUR_FILL_SYSTEM,
    tool_name: '(freeform, no tool)',
    notes: 'Writes the rich Outcome document. No schema — pure prose. Past-tense, neutral, witty-specific (Ahmed in the fruit bowl).',
  },
];

const SEER_AGENTS: AgentSpec[] = [
  {
    id: 'director-intro',
    name: 'directorIntro',
    runtime: 'cloud',
    call_pattern: 'serial — fires once in SeerEngine constructor (stage 1 of intro)',
    input_type: 'IntroDirectorInput',
    output_type: 'string (prose_brief)',
    inputs: 'profile + story + heldProbes + investigation + intention + surveyHistory + outcomes',
    outputs: 'string (prose_brief — the detective brief the seer reads silently)',
    prompt: INTRO_DIRECTOR_SYSTEM,
    tool_name: INTRO_DIRECTOR_TOOL.name,
    notes: 'Writes the prose brief that all subsequent per-card / closing director calls reuse. StoryObject is the spine: past_root → present_pressure → fork. Orients across outcomes; never advocates.',
  },
  {
    id: 'actor-intro',
    name: 'actorIntro',
    runtime: 'local',
    call_pattern: 'serial — fires once after directorIntro (stage 2 of intro). Skipped on preferred_intro path.',
    input_type: 'IntroActorInput',
    output_type: 'Monologue',
    inputs: 'profile + prose_brief',
    outputs: 'Monologue { text ≤14 words }',
    prompt: INTRO_ACTOR_SYSTEM,
    tool_name: INTRO_ACTOR_TOOL.name,
    notes: 'The seer\'s opening line. Lands the participant in the room. Does NOT demonstrate insight yet.',
  },
  {
    id: 'director-percard',
    name: 'directorPerCard',
    runtime: 'cloud',
    call_pattern: 'speculative fan-out — fires per face-down slot per round (4 → 3 → 2 → 1)',
    input_type: 'PerCardDirectorInput',
    output_type: 'Set',
    inputs: 'profile + prose_brief + outcomes + slot card + slot meaning (story-mapped) + revealed_history + chat_history',
    outputs: 'Set { click, attending, intent, knows, uncertainty, through_line, reframe? }',
    prompt: PER_CARD_DIRECTOR_SYSTEM,
    tool_name: PER_CARD_DIRECTOR_TOOL.name,
    notes: 'Story slots map to card positions: top = past_root, bottom = present_pressure, left = fork.a, right = fork.b. Picks one outcome this card sharpens; embeds a specific from it into the Set. Actor never reads outcomes — visions land via the Set.',
  },
  {
    id: 'actor-percard',
    name: 'actorPerCard',
    runtime: 'local',
    call_pattern: 'serial — fires after its paired directorPerCard (same fan-out thread)',
    input_type: 'PerCardActorInput',
    output_type: 'Monologue',
    inputs: 'profile + prose_brief + Set + card + revealed_history + chat_history',
    outputs: 'Monologue { text 2–4 sentences, prompt_to_user? }',
    prompt: PER_CARD_ACTOR_SYSTEM,
    tool_name: PER_CARD_ACTOR_TOOL.name,
    notes: 'Voices the beat from the prepared Set. When Set.reframe present, voices the swap directly.',
  },
  {
    id: 'actor-chat',
    name: 'actorChat',
    runtime: 'local',
    call_pattern: 'fires on user chat send (director-side chat deferred)',
    input_type: 'ChatActorInput',
    output_type: 'Monologue',
    inputs: 'profile + prose_brief + revealed + chat_history + user_message',
    outputs: 'Monologue',
    prompt: CHAT_ACTOR_SYSTEM,
    tool_name: CHAT_ACTOR_TOOL.name,
    notes: 'Quick chat reply. Future: parallel director pass that updates seer.context.',
  },
  {
    id: 'director-closing',
    name: 'directorClosing',
    runtime: 'cloud',
    call_pattern: 'serial — fires after the 4th card is voiced (stage 1 of outro)',
    input_type: 'ClosingDirectorInput',
    output_type: 'ClosingIntent',
    inputs: 'profile + prose_brief + outcomes + heldProbes + revealed (all 4 beats) + chat_history',
    outputs: 'ClosingIntent { takeaway, director_notes }',
    prompt: CLOSING_DIRECTOR_SYSTEM,
    tool_name: CLOSING_DIRECTOR_TOOL.name,
    notes: 'Plans the structural takeaway. Mirror, not oracle. May take a risky swing at a held probe (oldest first). May name an outcome but never picks one.',
  },
  {
    id: 'actor-closing',
    name: 'actorClosing',
    runtime: 'local',
    call_pattern: 'parallel with mantra — fires after directorClosing (stage 2 of outro). Voiced by the seer.',
    input_type: 'ClosingActorInput',
    output_type: 'Monologue',
    inputs: 'profile + prose_brief + revealed + chat_history + closing intent',
    outputs: 'Monologue { 1–2 sentences, low-volume }',
    prompt: CLOSING_ACTOR_SYSTEM,
    tool_name: CLOSING_ACTOR_TOOL.name,
    notes: 'The line the participant carries home. Drops the voice. Runs concurrently with the mantra agent — same input (closing director\'s takeaway), different output shape.',
  },
  {
    id: 'mantra',
    name: 'Mantra',
    runtime: 'cloud',
    call_pattern: 'parallel with actorClosing — fires after directorClosing. Distinct compression of the same takeaway.',
    input_type: 'MantraInput',
    output_type: 'string (sanitized one-liner)',
    inputs: 'profile + story + intention + revealed + chat + closing_takeaway',
    outputs: 'string (≤120 chars, lowercase, no markdown, no emoji, no surrounding quotes)',
    prompt: MANTRA_SYSTEM,
    tool_name: '(freeform, no tool)',
    notes: 'Ticker-tape-printable. Tighter, more portable form of the closing director\'s takeaway — same shape, smaller form. Rendered in Reading.tsx after the outro typewriter completes. Sanitizer strips emoji/markdown/preambles/surrounding quotes defensively.',
  },
];

// ── Mermaid diagrams ────────────────────────────────────────
//
// Sizing strategy:
//   - Every agent BOX has a uniform 2-line label (name + runtime tag),
//     wrapped in a fixed-width <div>. Heights match because line count
//     matches. Edge labels carry per-step extras (e.g. "suppressed past
//     cap−N") so the boxes themselves never grow.
//   - User-action and i/o nodes also use the same width div, but with
//     different shape syntax (`[]` rectangle for actions, `[/.../]`
//     parallelogram for i/o artifacts) so the type stays visually
//     distinct at a glance.
//
// Color classes:
//   local      → turquoise
//   cloud      → violet
//   userAction → red
//   io         → muted violet (italic)

const BOX_W = 170;
const BOX = (s: string) => `<div style='width:${BOX_W}px;text-align:center;'>${s}</div>`;

// Two-line agent label: {name, runtime}. Heights match across all agents.
const AGENT = (name: string, runtime: 'local' | 'cloud') =>
  BOX(`${name}<br/><i>${runtime}</i>`);

// Render input/output as a multi-line edge label. `<br/>` works because
// MermaidDiagram sets htmlLabels: true.
const IO = (typeName: string, fields: string) =>
  fields ? `<b>${typeName}</b><br/>${fields}` : `<b>${typeName}</b>`;

const SURVEY_DIAGRAM = `flowchart TD
  start([survey start]) --> openers
  subgraph openers["Openers · no AI · no profile mutations"]
    direction LR
    o1["${BOX('name')}"] --> o2["${BOX('birthday')}"] --> o3["${BOX('relationship_pick')}"] --> o4["${BOX('intent<br/><i>question sandwich, part 1</i>')}"]
  end
  openers --> seed
  seed[/"${BOX(`seed Pillars (~8) +<br/>${STARTER_SEED_COUNT} random pool draws<br/>into queue (dedup'd<br/>vs prior visits)`)}"/]
  seed --> ans["${BOX('user answers a<br/>question')}"]

  ans -->|"${IO('PickEvent', '{node_id, answer,<br/>latency_ms, initial_pick,<br/>interaction_count}')}"| snapshot[/"${BOX('1 · snapshot prev state<br/>(for undo)<br/>2 · bump pickEpoch')}"/]
  snapshot --> seeder[/"${BOX('algorithmic seeder<br/>(deterministic, no LLM):<br/>Inversions probe →<br/>fresh tentative hypotheses<br/>+ age existing seeds')}"/]
  seeder --> fanOut(["◀ pipeline fan-out ▶"])
  fanOut ==>|"${IO('ObserverInput', 'profile template + profile.body<br/>+ Q-and-A history<br/>+ side-channel telemetry<br/>+ investigation board')}"| obs["${AGENT('Observer', 'cloud')}"]
  fanOut ==>|"${IO('DetectiveInput', 'snapshot + investigation<br/>+ current story<br/>+ private_thoughts')}"| det["${AGENT('Detective', 'cloud')}"]
  obs -->|"${IO('ObserverOutput', '{profile_body, hooks, edges,<br/>side_channel, cast_notes_updates,<br/>hypothesis_ladder_moves}')}"| applyO[/"${BOX('apply: rewrite body,<br/>merge cast notes,<br/>route ladder moves')}"/]
  det -->|"${IO('DetectiveOutput', '{new_hypotheses,<br/>hypothesis_ladder_moves,<br/>story_updates, private_thoughts}')}"| applyD[/"${BOX('apply: add hyps,<br/>merge story,<br/>route ladder moves')}"/]
  applyO --> ans
  applyD --> ans

  ans -. "cap reached" .-> intentConfirm["${BOX('IntentConfirm UI<br/><i>question sandwich, part 2</i>')}"]
  intentConfirm --> userPick["${BOX('user types final<br/>intention (≥10 chars)')}"]

  userPick --> reaper[/"${BOX('reaper:<br/>held[] sorted by<br/>age_in_turns DESC')}"/]
  reaper -->|"${IO('intention + story + heldProbes', '')}"| augur1["${AGENT('Augur · Outline', 'cloud')}"]
  augur1 -->|"${IO('Outcome[]', '{id, label}  · 2–4 entries')}"| augur2["${AGENT('Augur · Fill ×N', 'cloud')}"]
  augur2 -->|"${IO('Outcome[]', '{id, label, document}<br/>document: markdown prose')}"| outcomes[/"${BOX('outcome documents')}"/]
  outcomes ==>|"${IO('SeerOpts', 'profile + story + heldProbes<br/>+ investigation + intention<br/>+ drawn + outcomes')}"| seerStart[("new SeerEngine<br/>→ see below")]

  classDef local      fill:#0b2a30,stroke:#22d3ee,color:#a5f3fc,stroke-width:1.2px;
  classDef cloud      fill:#1a0a2e,stroke:#7c3aed,color:#e8e0ff,stroke-width:1.2px;
  classDef userAction fill:#2a0b14,stroke:#e2536e,color:#fde2e6,stroke-width:1.2px;
  classDef io         fill:#0a0418,stroke:#564a78,color:#cfc4f0,font-style:italic;
  classDef terminal   fill:#1a0a2e,stroke:#22d3ee,color:#cffafe,stroke-width:1.2px;
  classDef gate       fill:#0a1a30,stroke:#fbbf24,color:#fde68a,stroke-width:1.6px;

  class obs,det,augur1,augur2 cloud;
  class ans,o1,o2,o3,o4,userPick,intentConfirm userAction;
  class seed,outcomes,snapshot,seeder,applyO,applyD,reaper io;
  class start,seerStart terminal;
  class fanOut gate;
`;

const SEER_DIAGRAM = `flowchart TD
  seerStart[("new SeerEngine<br/>{profile, story, heldProbes,<br/>investigation, intention,<br/>drawn, outcomes}")]
  seerStart -->|"${IO('IntroDirectorInput', '{profile, story, heldProbes,<br/>intention, surveyHistory, outcomes}')}"| dIntro["${AGENT('directorIntro', 'cloud')}"]
  dIntro -->|"${IO('prose_brief', 'string (detective brief,<br/>spine = past_root →<br/>present_pressure → fork)')}"| aIntro["${AGENT('actorIntro', 'local')}"]
  aIntro -->|"${IO('Monologue', '{text ≤14 words}')}"| ready((seer.ready resolves))
  ready --> enterBtn["${BOX('user clicks<br/>ENTER')}"]
  enterBtn --> introBeat[/"${BOX('intro delivered')}"/]
  introBeat --> awaitFlip["${BOX('user flips<br/>a card')}"]

  awaitFlip -->|"${IO('PerCardDirectorInput', '{profile, prose_brief, outcomes,<br/>this_slot card, slot_meaning,<br/>revealed_history, chat_history}<br/>× each face-down slot')}"| fanOutSeer["${AGENT('directorPerCard ×N', 'cloud')}"]
  fanOutSeer -->|"${IO('Set', '{click, attending, intent, knows,<br/>uncertainty, through_line, reframe?}<br/>(cached per slot)')}"| persona["${AGENT('actorPerCard', 'local')}"]
  persona -->|"${IO('Monologue', '{text 2–4 sentences,<br/>prompt_to_user?}')}"| beat[/"${BOX('beat delivered')}"/]
  beat --> awaitFlip

  awaitFlip -. "${IO('chat send (parallel)', '')}" .-> chat["${BOX('user types<br/>chat message')}"]
  chat -->|"${IO('ChatActorInput', '{profile, prose_brief, revealed,<br/>chat_history, user_message}')}"| actorChat["${AGENT('actorChat', 'local')}"]
  actorChat -->|"${IO('Monologue', '{text}')}"| chatReply[/"${BOX('reply delivered')}"/]
  chatReply --> awaitFlip

  awaitFlip -. "4th flip done" .-> dClose["${AGENT('directorClosing', 'cloud')}"]
  dClose --> closingGate(["◀ closing fan-out ▶"])
  closingGate ==>|"${IO('ClosingActorInput', 'profile + prose_brief + revealed<br/>+ chat_history + closing intent')}"| aClose["${AGENT('actorClosing', 'local')}"]
  closingGate ==>|"${IO('MantraInput', 'profile + story + intention<br/>+ revealed + chat<br/>+ closing_takeaway')}"| mantra["${AGENT('Mantra', 'cloud')}"]
  aClose -->|"${IO('Monologue', '{text 1–2 sentences, low-volume}')}"| done([reading complete])
  mantra -->|"${IO('string', '≤120 chars, lowercase,<br/>no markdown, no emoji<br/>(printable on ticker tape)')}"| done

  classDef local      fill:#0b2a30,stroke:#22d3ee,color:#a5f3fc,stroke-width:1.2px;
  classDef cloud      fill:#1a0a2e,stroke:#7c3aed,color:#e8e0ff,stroke-width:1.2px;
  classDef userAction fill:#2a0b14,stroke:#e2536e,color:#fde2e6,stroke-width:1.2px;
  classDef io         fill:#0a0418,stroke:#564a78,color:#cfc4f0,font-style:italic;
  classDef terminal   fill:#1a0a2e,stroke:#22d3ee,color:#cffafe,stroke-width:1.2px;
  classDef gate       fill:#0a1a30,stroke:#fbbf24,color:#fde68a,stroke-width:1.6px;

  class dIntro,fanOutSeer,dClose,mantra cloud;
  class aIntro,persona,actorChat,aClose local;
  class enterBtn,awaitFlip,chat userAction;
  class introBeat,beat,chatReply io;
  class seerStart,done,ready terminal;
  class closingGate gate;
`;

// ── Component ───────────────────────────────────────────────

type Props = { onBack: () => void };

export function Pipeline({ onBack }: Props) {
  return (
    <div className="pipeline">
      <header className="pipeline__head">
        <button className="btn btn--quiet" onClick={onBack}>← back</button>
        <h1 className="pipeline__title">pipeline</h1>
        <p className="pipeline__caption">
          live prompts + structure. local agents (turquoise) run on the
          booth's on-prem LLM in prod (Claude as scaffolding today). cloud
          agents (violet) stay on Anthropic API. user actions are red.
        </p>
        <div className="pipeline__legend">
          <span className="pipeline__legend-item pipeline__legend-item--local">local</span>
          <span className="pipeline__legend-item pipeline__legend-item--cloud">cloud</span>
          <span className="pipeline__legend-item pipeline__legend-item--user">user</span>
        </div>
      </header>

      <PipelineSection
        title="SurveyEngine"
        diagram={SURVEY_DIAGRAM}
        diagramId="survey"
        agents={SURVEY_AGENTS}
      />

      <PipelineSection
        title="SeerEngine"
        diagram={SEER_DIAGRAM}
        diagramId="seer"
        agents={SEER_AGENTS}
      />
    </div>
  );
}

function PipelineSection({
  title,
  diagram,
  diagramId,
  agents,
}: {
  title: string;
  diagram: string;
  diagramId: string;
  agents: AgentSpec[];
}) {
  return (
    <section className="pipeline__section">
      <h2 className="pipeline__section-title">{title}</h2>
      <MermaidDiagram code={diagram} id={diagramId} />
      <div className="pipeline__agents">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
      </div>
    </section>
  );
}

function MermaidDiagram({ code, id }: { code: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: 'transparent',
        primaryColor: '#1a0a2e',
        primaryTextColor: '#e8e0ff',
        primaryBorderColor: '#7c3aed',
        lineColor: '#7c3aed',
        secondaryColor: '#0a0418',
        tertiaryColor: '#0a0418',
        fontFamily: 'monospace',
      },
      flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', padding: 20 },
    });

    let cancelled = false;
    (async () => {
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, code);
        if (cancelled) return;
        if (ref.current) ref.current.innerHTML = svg;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'mermaid render failed');
      }
    })();
    return () => { cancelled = true; };
  }, [code, id]);

  if (error) {
    return <div className="pipeline__diagram-error">diagram error: {error}</div>;
  }
  return <div ref={ref} className="pipeline__diagram" />;
}

function AgentCard({ agent }: { agent: AgentSpec }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className={`pipeline__agent pipeline__agent--${agent.runtime} ${expanded ? 'pipeline__agent--expanded' : ''}`}>
      <header
        className="pipeline__agent-head"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
      >
        <span className="pipeline__agent-name">{agent.name}</span>
        <span className={`pipeline__agent-runtime pipeline__agent-runtime--${agent.runtime}`}>{agent.runtime}</span>
        <span className="pipeline__agent-expand">{expanded ? '−' : '+'}</span>
      </header>
      {expanded && (
        <div className="pipeline__agent-body">
          <Field label="call pattern" value={agent.call_pattern} />
          <Field label="input type" value={agent.input_type} mono />
          <Field label="output type" value={agent.output_type} mono />
          <Field label="inputs" value={agent.inputs} />
          <Field label="outputs" value={agent.outputs} />
          {agent.tool_name && <Field label="tool" value={agent.tool_name} mono />}
          {agent.notes && <Field label="notes" value={agent.notes} />}
          <div className="pipeline__agent-prompt-label">prompt</div>
          <pre className="pipeline__agent-prompt">{agent.prompt}</pre>
        </div>
      )}
    </article>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="pipeline__field">
      <span className="pipeline__field-label">{label}</span>
      <span className={`pipeline__field-value ${mono ? 'pipeline__field-value--mono' : ''}`}>{value}</span>
    </div>
  );
}
