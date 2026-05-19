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

import { OBSERVER_SYSTEM, OBSERVER_TOOL } from '../pipeline/survey/prompts/observer';
import { DETECTIVE_SYSTEM, DETECTIVE_TOOL } from '../pipeline/survey/prompts/detective';
import { INTERROGATOR_SYSTEM, INTERROGATOR_TOOL } from '../pipeline/survey/prompts/interrogator';
import { SHAMAN_SYSTEM, SHAMAN_TOOL } from '../pipeline/survey/prompts/shaman';
import {
  AUGUR_OUTLINE_SYSTEM,
  AUGUR_OUTLINE_TOOL,
  AUGUR_FILL_SYSTEM,
} from '../pipeline/survey/prompts/augur';

import {
  PER_CARD_DIRECTOR_SYSTEM,
  PER_CARD_DIRECTOR_TOOL,
  CLOSING_DIRECTOR_SYSTEM,
  CLOSING_DIRECTOR_TOOL,
  INTRO_DIRECTOR_SYSTEM,
  INTRO_DIRECTOR_TOOL,
} from '../pipeline/seer/prompts/director';
import {
  PER_CARD_ACTOR_SYSTEM,
  PER_CARD_ACTOR_TOOL,
  INTRO_ACTOR_SYSTEM,
  INTRO_ACTOR_TOOL,
  CLOSING_ACTOR_SYSTEM,
  CLOSING_ACTOR_TOOL,
  CHAT_ACTOR_SYSTEM,
  CHAT_ACTOR_TOOL,
} from '../pipeline/seer/prompts/actor';

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
    id: 'observer',
    name: 'Observer',
    runtime: 'cloud',
    call_pattern: 'parallel — fires every 3rd post-opener pick. Metabolizes a window of recent picks (size 3) at once.',
    input_type: 'PipelineContext (+ recent_picks)',
    output_type: 'ObserverOutput',
    inputs: 'snapshot at pipeline start + recent_picks (last 3 picks)',
    outputs: 'ObserverOutput { notes_to_append, cast_updates }',
    prompt: OBSERVER_SYSTEM,
    tool_name: OBSERVER_TOOL.name,
    notes: 'Cloud (Sonnet) because cross-turn observation needs quality reasoning. Fires sparsely — each fire catches up multiple turns.',
  },
  {
    id: 'detective',
    name: 'Detective',
    runtime: 'cloud',
    call_pattern: 'parallel — fires every post-answer pipeline alongside Observer + Interrogator. Sees the snapshot ctx, not other agents\' updates.',
    input_type: 'PipelineContext',
    output_type: 'DetectiveOutput',
    inputs: 'snapshot at pipeline start',
    outputs: 'DetectiveOutput { hypothesis_updates, choice_update, contradictions, hooks, posture, intention_guess? }',
    prompt: DETECTIVE_SYSTEM,
    tool_name: DETECTIVE_TOOL.name,
    notes: 'Plays Clue. Drops one optional intention_guess per turn into a write-only stack for the Shaman. Cross-agent context lag is 1 turn (parallel pipeline).',
  },
  {
    id: 'interrogator',
    name: 'Interrogator',
    runtime: 'local',
    call_pattern: `parallel — fires every post-answer pipeline alongside Observer + Detective. Suppressed past cap−${STARTER_SEED_COUNT} turns so starter-pool seeds carry the final stretch.`,
    input_type: 'PipelineContext',
    output_type: 'InterrogatorOutput',
    inputs: 'snapshot at pipeline start',
    outputs: 'InterrogatorOutput { next_question: { node_id, preamble?, options_override? } }',
    prompt: INTERROGATOR_SYSTEM,
    tool_name: INTERROGATOR_TOOL.name,
    notes: 'Picks next question from basket. Can rewrite choice options to inject a high-confidence guess. Local (Haiku) — mechanical task, latency matters.',
  },
  {
    id: 'shaman',
    name: 'Shaman',
    runtime: 'cloud',
    call_pattern: 'blocking — once at survey close',
    input_type: 'ShamanInput',
    output_type: 'ShamanOutput',
    inputs: 'ShamanInput { profile, investigation, history }. Reads detective intention_guesses stack.',
    outputs: 'ShamanOutput { intentions: 4 strings }',
    prompt: SHAMAN_SYSTEM,
    tool_name: SHAMAN_TOOL.name,
    notes: 'Empathizes with the user. Becomes them. Picks 4 specific Should/Do questions they might bring to the oracle. Redundancy in the detective stack is signal.',
  },
  {
    id: 'augur-outline',
    name: 'Augur — Stage 1: Outline',
    runtime: 'cloud',
    call_pattern: 'blocking — once after intention is picked',
    input_type: 'AugurOutlineInput',
    output_type: 'Outcome[] (id + label only)',
    inputs: 'profile + intention + survey history (compact)',
    outputs: 'Array<{ id, label }> (2–4 outcomes named)',
    prompt: AUGUR_OUTLINE_SYSTEM,
    tool_name: AUGUR_OUTLINE_TOOL.name,
    notes: 'Decides outcome SHAPE (binary / ternary / open). Names each outcome. No prose.',
  },
  {
    id: 'augur-fill',
    name: 'Augur — Stage 2: Fill',
    runtime: 'cloud',
    call_pattern: 'parallel fan-out — N invocations (one per outline entry)',
    input_type: 'AugurFillInput',
    output_type: 'string (markdown document)',
    inputs: 'profile + intention + survey history + ONE outcome (id + label)',
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
    inputs: 'profile + intention + surveyHistory + outcomes',
    outputs: 'string (prose_brief — the detective brief the seer reads silently)',
    prompt: INTRO_DIRECTOR_SYSTEM,
    tool_name: INTRO_DIRECTOR_TOOL.name,
    notes: 'Writes the prose brief that all subsequent per-card / closing director calls reuse. Orients across outcomes; never advocates.',
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
    inputs: 'profile + prose_brief + outcomes + slot card + revealed_history + chat_history',
    outputs: 'Set { click, attending, intent, knows, uncertainty, through_line, reframe? }',
    prompt: PER_CARD_DIRECTOR_SYSTEM,
    tool_name: PER_CARD_DIRECTOR_TOOL.name,
    notes: 'Picks one outcome this card sharpens; embeds a specific from it into the Set. Actor never reads outcomes — visions land via the Set.',
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
    inputs: 'profile + prose_brief + outcomes + revealed (all 4 beats) + chat_history',
    outputs: 'ClosingIntent { takeaway, director_notes }',
    prompt: CLOSING_DIRECTOR_SYSTEM,
    tool_name: CLOSING_DIRECTOR_TOOL.name,
    notes: 'Plans the structural takeaway. Mirror, not oracle. May name an outcome but never picks one.',
  },
  {
    id: 'actor-closing',
    name: 'actorClosing',
    runtime: 'local',
    call_pattern: 'serial — fires after directorClosing (stage 2 of outro)',
    input_type: 'ClosingActorInput',
    output_type: 'Monologue',
    inputs: 'profile + prose_brief + revealed + chat_history + closing intent',
    outputs: 'Monologue { 1–2 sentences, low-volume }',
    prompt: CLOSING_ACTOR_SYSTEM,
    tool_name: CLOSING_ACTOR_TOOL.name,
    notes: 'The line the participant carries home. Drops the voice.',
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
  subgraph openers["Openers · no AI"]
    direction LR
    o1["${BOX('name')}"] --> o2["${BOX('birthday')}"] --> o3["${BOX('has_question?')}"]
  end
  openers --> seed
  seed[/"${BOX(`seed ${STARTER_SEED_COUNT} random pool<br/>questions into queue`)}"/]
  seed --> ans["${BOX('user answers a<br/>question')}"]

  ans -->|"${IO('PickEvent', '{node_id, answer, latency_ms}')}"| snapshot[/"${BOX('snapshot ctx<br/>at pipeline start')}"/]
  snapshot -->|"${IO('PipelineContext + recent_picks', 'every 3rd turn only<br/>(metabolize window)')}"| obs["${AGENT('Observer', 'cloud')}"]
  snapshot -->|"${IO('PipelineContext', 'every turn')}"| det["${AGENT('Detective', 'cloud')}"]
  snapshot -->|"${IO('PipelineContext', 'every turn<br/>suppressed past cap−${STARTER_SEED_COUNT}')}"| int["${AGENT('Interrogator', 'local')}"]
  obs -->|"${IO('ObserverOutput', '{notes_to_append, cast_updates}<br/>→ profile')}"| applyO[/"${BOX('apply to profile')}"/]
  det -->|"${IO('DetectiveOutput', '{hypothesis_updates, choice_update,<br/>contradictions, hooks, posture,<br/>intention_guess?}<br/>→ investigation')}"| applyD[/"${BOX('apply to investigation')}"/]
  int -->|"${IO('InterrogatorOutput', '{next_question: {node_id, preamble?,<br/>options_override?}}<br/>→ queue')}"| applyI[/"${BOX('append 1 to queue')}"/]
  applyI --> ans
  applyO --> ans
  applyD --> ans

  ans -. "cap reached" .-> shaman["${AGENT('Shaman', 'cloud')}"]
  shaman -->|"${IO('ShamanOutput', '{intentions: 4 strings}')}"| picker[/"${BOX('4 intention<br/>suggestions')}"/]
  picker --> userPick["${BOX('user picks /<br/>writes intention')}"]

  userPick -->|"${IO('intention', 'string (user vernacular)')}"| augur1["${AGENT('Augur · Outline', 'cloud')}"]
  augur1 -->|"${IO('Outcome[]', '{id, label}  · 2–4 entries')}"| augur2["${AGENT('Augur · Fill ×N', 'cloud')}"]
  augur2 -->|"${IO('Outcome[]', '{id, label, document}<br/>document: markdown prose')}"| outcomes[/"${BOX('outcome documents')}"/]
  outcomes ==> seerStart[("new SeerEngine<br/>→ see below")]

  classDef local      fill:#0b2a30,stroke:#22d3ee,color:#a5f3fc,stroke-width:1.2px;
  classDef cloud      fill:#1a0a2e,stroke:#7c3aed,color:#e8e0ff,stroke-width:1.2px;
  classDef userAction fill:#2a0b14,stroke:#e2536e,color:#fde2e6,stroke-width:1.2px;
  classDef io         fill:#0a0418,stroke:#564a78,color:#cfc4f0,font-style:italic;
  classDef terminal   fill:#1a0a2e,stroke:#22d3ee,color:#cffafe,stroke-width:1.2px;

  class int local;
  class obs,det,shaman,augur1,augur2 cloud;
  class ans,o1,o2,o3,userPick userAction;
  class seed,picker,outcomes,snapshot,applyO,applyD,applyI io;
  class start,seerStart terminal;
`;

const SEER_DIAGRAM = `flowchart TD
  seerStart[("new SeerEngine<br/>{profile, intention, history,<br/>drawn, outcomes}")]
  seerStart -->|"${IO('IntroDirectorInput', '{profile, intention,<br/>surveyHistory, outcomes}')}"| dIntro["${AGENT('directorIntro', 'cloud')}"]
  dIntro -->|"${IO('prose_brief', 'string (detective brief,<br/>read silently by all<br/>subsequent director calls)')}"| aIntro["${AGENT('actorIntro', 'local')}"]
  aIntro -->|"${IO('Monologue', '{text ≤14 words}')}"| ready((seer.ready resolves))
  ready --> enterBtn["${BOX('user clicks<br/>ENTER')}"]
  enterBtn --> introBeat[/"${BOX('intro delivered')}"/]
  introBeat --> awaitFlip["${BOX('user flips<br/>a card')}"]

  awaitFlip -->|"${IO('PerCardDirectorInput', '{profile, prose_brief, outcomes,<br/>this_slot card, revealed_history,<br/>chat_history}  × all face-down slots')}"| fanOut["${AGENT('directorPerCard ×N', 'cloud')}"]
  fanOut -->|"${IO('Set', '{click, attending, intent, knows,<br/>uncertainty, through_line, reframe?}<br/>(cached per slot)')}"| persona["${AGENT('actorPerCard', 'local')}"]
  persona -->|"${IO('Monologue', '{text 2–4 sentences,<br/>prompt_to_user?}')}"| beat[/"${BOX('beat delivered')}"/]
  beat --> awaitFlip

  awaitFlip -. "${IO('chat send (parallel)', '')}" .-> chat["${BOX('user types<br/>chat message')}"]
  chat -->|"${IO('ChatActorInput', '{profile, prose_brief, revealed,<br/>chat_history, user_message}')}"| actorChat["${AGENT('actorChat', 'local')}"]
  actorChat -->|"${IO('Monologue', '{text}')}"| chatReply[/"${BOX('reply delivered')}"/]
  chatReply --> awaitFlip

  awaitFlip -. "4th flip done" .-> dClose["${AGENT('directorClosing', 'cloud')}"]
  dClose -->|"${IO('ClosingIntent', '{takeaway, director_notes}')}"| aClose["${AGENT('actorClosing', 'local')}"]
  aClose -->|"${IO('Monologue', '{text 1–2 sentences, low-volume}')}"| done([reading complete])

  classDef local      fill:#0b2a30,stroke:#22d3ee,color:#a5f3fc,stroke-width:1.2px;
  classDef cloud      fill:#1a0a2e,stroke:#7c3aed,color:#e8e0ff,stroke-width:1.2px;
  classDef userAction fill:#2a0b14,stroke:#e2536e,color:#fde2e6,stroke-width:1.2px;
  classDef io         fill:#0a0418,stroke:#564a78,color:#cfc4f0,font-style:italic;
  classDef terminal   fill:#1a0a2e,stroke:#22d3ee,color:#cffafe,stroke-width:1.2px;

  class dIntro,fanOut,dClose cloud;
  class aIntro,persona,actorChat,aClose local;
  class enterBtn,awaitFlip,chat userAction;
  class introBeat,beat,chatReply io;
  class seerStart,done,ready terminal;
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
