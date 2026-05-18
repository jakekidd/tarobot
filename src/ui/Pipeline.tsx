// Pipeline audit page.
//
// One scrollable / zoomable canvas with two sections (SurveyEngine and
// SeerEngine). Each section: a Mermaid flowchart at the top showing
// structure, then per-agent detail cards below with their prompt text
// pulled LIVE from the source files — so the page is always in sync
// with what production actually runs.
//
// Mermaid is hand-authored (the structural graph rarely changes).
// Prompts come straight from the exported constants. If someone edits
// a prompt, this page reflects it on next reload — no double-source.

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// ── Live prompt imports ─────────────────────────────────────
// Pulling the exported constants from each agent's prompts file. The
// page never gets out of sync with what the model actually sees.

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
  PER_CARD_COGNITION_SYSTEM,
  PER_CARD_COGNITION_TOOL,
  CLOSING_COGNITION_SYSTEM,
  CLOSING_COGNITION_TOOL,
  INTRO_COGNITION_SYSTEM,
  INTRO_COGNITION_TOOL,
} from '../pipeline/seer/prompts/cognition';
import {
  PER_CARD_PERSONA_SYSTEM,
  PER_CARD_PERSONA_TOOL,
  INTRO_PERSONA_SYSTEM,
  INTRO_PERSONA_TOOL,
  CLOSING_PERSONA_SYSTEM,
  CLOSING_PERSONA_TOOL,
  CHAT_PERSONA_SYSTEM,
  CHAT_PERSONA_TOOL,
} from '../pipeline/seer/prompts/persona';

// ── Agent metadata ──────────────────────────────────────────

type AgentTier = 'fast' | 'cognition' | 'deep';

type AgentSpec = {
  id: string;
  name: string;
  tier: AgentTier;
  call_pattern: string;        // "serial in pipeline", "parallel fan-out", etc
  inputs: string;              // type names + shape
  outputs: string;
  prompt: string;
  tool_name?: string;
  notes?: string;
};

const SURVEY_AGENTS: AgentSpec[] = [
  {
    id: 'observer',
    name: 'Observer',
    tier: 'cognition',
    call_pattern: 'serial — stage 1 of post-answer pipeline',
    inputs: 'PipelineContext (this_turn, profile, investigation, history)',
    outputs: 'ObserverOutput (notes_to_append, cast_updates)',
    prompt: OBSERVER_SYSTEM,
    tool_name: OBSERVER_TOOL.name,
    notes: 'Metabolizes one answer into profile section notes + cast updates. Deliberately light on rules — flexible by design.',
  },
  {
    id: 'detective',
    name: 'Detective',
    tier: 'cognition',
    call_pattern: 'serial — stage 2 of post-answer pipeline (after Observer)',
    inputs: 'PipelineContext (with profile updated by Observer)',
    outputs: 'DetectiveOutput (hypothesis_updates, choice_update, contradictions, hooks, posture, intention_guess?)',
    prompt: DETECTIVE_SYSTEM,
    tool_name: DETECTIVE_TOOL.name,
    notes: 'Plays Clue. Updates investigation. Drops one optional intention_guess per turn into a write-only stack for the Shaman to consult later.',
  },
  {
    id: 'interrogator',
    name: 'Interrogator',
    tier: 'cognition',
    call_pattern: 'serial — stage 3 of post-answer pipeline (after Detective). Suppressed once question_cap is reached.',
    inputs: 'PipelineContext (with profile + investigation updated). Includes basket of unasked questions.',
    outputs: 'InterrogatorOutput (next_question: { node_id, preamble?, options_override? })',
    prompt: INTERROGATOR_SYSTEM,
    tool_name: INTERROGATOR_TOOL.name,
    notes: 'Picks next question from basket. Can rewrite choice options to inject a high-confidence guess (cold reading mechanized). At most one guess per question.',
  },
  {
    id: 'shaman',
    name: 'Shaman',
    tier: 'cognition',
    call_pattern: 'blocking — once at survey close',
    inputs: 'ShamanInput (profile, investigation, history). Reads the detective intention_guesses stack.',
    outputs: 'ShamanOutput (intentions: exactly 4 strings in user vernacular)',
    prompt: SHAMAN_SYSTEM,
    tool_name: SHAMAN_TOOL.name,
    notes: 'Empathizes with the user. Becomes them. Picks 4 specific Should/Do questions they might bring to the oracle. Redundancy in the detective stack is signal.',
  },
  {
    id: 'augur-outline',
    name: 'Augur — Stage 1: Outline',
    tier: 'cognition',
    call_pattern: 'blocking — once after intention is picked',
    inputs: 'profile + intention + survey history (compact)',
    outputs: 'Array<{ id, label }> (2-4 outcomes named)',
    prompt: AUGUR_OUTLINE_SYSTEM,
    tool_name: AUGUR_OUTLINE_TOOL.name,
    notes: 'Decides outcome SHAPE (binary / ternary / open). Names each outcome. No prose.',
  },
  {
    id: 'augur-fill',
    name: 'Augur — Stage 2: Fill',
    tier: 'deep',
    call_pattern: 'parallel fan-out — N invocations (one per outline entry)',
    inputs: 'profile + intention + survey history + ONE outcome (id + label)',
    outputs: 'string (freely-written markdown document; ~2000 token cap)',
    prompt: AUGUR_FILL_SYSTEM,
    tool_name: '(freeform, no tool)',
    notes: 'Writes the rich Outcome document. No schema — pure prose. Past-tense, neutral, witty-specific (Ahmed in the fruit bowl).',
  },
];

const SEER_AGENTS: AgentSpec[] = [
  {
    id: 'cognition-intro',
    name: 'cognitionIntro',
    tier: 'cognition',
    call_pattern: 'serial — fires once in SeerEngine constructor (stage 1 of intro)',
    inputs: 'profile + intention + surveyHistory + outcomes',
    outputs: 'string (prose_brief — detective brief the seer reads silently)',
    prompt: INTRO_COGNITION_SYSTEM,
    tool_name: INTRO_COGNITION_TOOL.name,
    notes: 'Writes the prose brief that all subsequent per-card / closing cognition reuses. Orients across outcomes; never advocates.',
  },
  {
    id: 'persona-intro',
    name: 'personaIntro',
    tier: 'deep',
    call_pattern: 'serial — fires once after cognitionIntro (stage 2 of intro). Skipped on preferred_intro path.',
    inputs: 'profile + prose_brief',
    outputs: 'Monologue (text ≤14 words)',
    prompt: INTRO_PERSONA_SYSTEM,
    tool_name: INTRO_PERSONA_TOOL.name,
    notes: 'The seer\'s opening line. Lands the participant in the room. Does NOT demonstrate insight yet.',
  },
  {
    id: 'cognition-percard',
    name: 'cognitionPerCard',
    tier: 'cognition',
    call_pattern: 'speculative fan-out — fires per face-down slot per round (max 4 in round 1, decreasing)',
    inputs: 'profile + prose_brief + outcomes + this_slot card + revealed_history + chat_history',
    outputs: 'Set (click, attending, intent, knows, uncertainty, through_line, reframe?)',
    prompt: PER_CARD_COGNITION_SYSTEM,
    tool_name: PER_CARD_COGNITION_TOOL.name,
    notes: 'Picks one outcome this card sharpens; embeds a specific from it into the Set. Persona never reads outcomes — visions land via the Set.',
  },
  {
    id: 'persona-percard',
    name: 'personaPerCard',
    tier: 'deep',
    call_pattern: 'serial — fires after its paired cognitionPerCard (same fan-out thread)',
    inputs: 'profile + prose_brief + Set + card + revealed_history + chat_history',
    outputs: 'Monologue (text 2-4 sentences, optional prompt_to_user)',
    prompt: PER_CARD_PERSONA_SYSTEM,
    tool_name: PER_CARD_PERSONA_TOOL.name,
    notes: 'Voices the beat from the prepared Set. When Set.reframe present, voices the swap directly.',
  },
  {
    id: 'persona-chat',
    name: 'personaChat',
    tier: 'cognition',
    call_pattern: 'fires on user chat send (no cognition pair currently — chat-cognition deferred)',
    inputs: 'profile + prose_brief + revealed + chat_history + user_message',
    outputs: 'Monologue',
    prompt: CHAT_PERSONA_SYSTEM,
    tool_name: CHAT_PERSONA_TOOL.name,
    notes: 'Quick chat reply. Cognition-tier (not deep) to keep latency down. Future: parallel cognition pass that updates seer.context.',
  },
  {
    id: 'cognition-closing',
    name: 'cognitionClosing',
    tier: 'cognition',
    call_pattern: 'serial — fires after the 4th card is voiced (stage 1 of outro)',
    inputs: 'profile + prose_brief + outcomes + revealed (all 4 beats) + chat_history',
    outputs: 'ClosingIntent (takeaway, director_notes)',
    prompt: CLOSING_COGNITION_SYSTEM,
    tool_name: CLOSING_COGNITION_TOOL.name,
    notes: 'Plans the structural takeaway. Mirror, not oracle. May name an outcome but never picks one.',
  },
  {
    id: 'persona-closing',
    name: 'personaClosing',
    tier: 'deep',
    call_pattern: 'serial — fires after cognitionClosing (stage 2 of outro)',
    inputs: 'profile + prose_brief + revealed + chat_history + closing intent',
    outputs: 'Monologue (1-2 sentences, low-volume)',
    prompt: CLOSING_PERSONA_SYSTEM,
    tool_name: CLOSING_PERSONA_TOOL.name,
    notes: 'The line the participant carries home. Drops the voice.',
  },
];

// ── Mermaid diagrams (hand-authored structure; prompts live below) ──

const SURVEY_DIAGRAM = `flowchart TD
  start([survey start]) --> openers
  subgraph openers["Openers (no AI)"]
    direction LR
    o1[name] --> o2[birthday] --> o3[has_question?]
  end
  openers --> seed
  seed[/Seed 6 random pool questions/]
  seed --> ans[User answers a question]

  ans --> obs[Observer<br/>cognition]
  obs --> det[Detective<br/>cognition]
  det --> int[Interrogator<br/>cognition<br/>suppressed past cap]
  int --> appendQ[/Append 1 to queue/]
  appendQ --> ans

  ans -.cap=20 reached.-> shaman
  shaman[Shaman<br/>cognition<br/>blocking]
  shaman --> picker[/4 intention suggestions/]
  picker --> userPick[User picks/writes intention]

  userPick --> augur1[Augur Stage 1: Outline<br/>cognition]
  augur1 --> augur2[Augur Stage 2: Fill<br/>deep · parallel N]
  augur2 --> outcomes[/Outcome documents/]
  outcomes ==> seerStart[(handoff to SeerEngine)]

  classDef agent fill:#1a0a2e,stroke:#b388ff,color:#e8e0ff;
  classDef ioNode fill:#0a0418,stroke:#6b5a8a,color:#cfc4f0,font-style:italic;
  classDef opener fill:#0a0418,stroke:#50456a,color:#9088b0;
  classDef terminal fill:#1a0a2e,stroke:#22d3ee,color:#cffafe;
  class obs,det,int,shaman,augur1,augur2 agent;
  class seed,picker,appendQ,outcomes ioNode;
  class o1,o2,o3 opener;
  class start,seerStart terminal;
`;

const SEER_DIAGRAM = `flowchart TD
  seerStart[(new SeerEngine)]
  seerStart --> cogIntro[cognitionIntro<br/>cognition]
  cogIntro --> brief[/prose_brief/]
  brief --> personaIntro[personaIntro<br/>deep]
  personaIntro --> ready((seer.ready resolves))
  ready --> enterBtn[ENTER button]
  enterBtn --> flyIn[Camera fly-in]
  flyIn --> introBeat[Intro delivered]
  introBeat --> awaitFlip{User flips a card}

  awaitFlip --> fanOut[Speculative fan-out: cognitionPerCard for each face-down slot]
  fanOut --> persona[personaPerCard for picked slot]
  persona --> beat[Beat delivered]
  beat --> awaitFlip

  awaitFlip -.parallel.-> chat[User chats] --> personaChat[personaChat<br/>cognition]
  personaChat --> chatReply[Reply]
  chatReply --> awaitFlip

  awaitFlip -.4th card flipped.-> cogClose[cognitionClosing<br/>cognition]
  cogClose --> personaClose[personaClosing<br/>deep]
  personaClose --> done([Reading complete])

  classDef agent fill:#1a0a2e,stroke:#b388ff,color:#e8e0ff;
  classDef ioNode fill:#0a0418,stroke:#6b5a8a,color:#cfc4f0,font-style:italic;
  classDef terminal fill:#1a0a2e,stroke:#22d3ee,color:#cffafe;
  class cogIntro,personaIntro,fanOut,persona,personaChat,cogClose,personaClose agent;
  class brief,beat,chatReply,enterBtn,introBeat agent;
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
          live prompts + structure. mermaid diagrams hand-authored; prompt text
          imported straight from the source — edit a prompt, reload, page reflects.
        </p>
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
        primaryBorderColor: '#b388ff',
        lineColor: '#b388ff',
        secondaryColor: '#0a0418',
        tertiaryColor: '#0a0418',
        fontFamily: 'monospace',
      },
      flowchart: { useMaxWidth: false, htmlLabels: true },
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
    <article className={`pipeline__agent ${expanded ? 'pipeline__agent--expanded' : ''}`}>
      <header
        className="pipeline__agent-head"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
      >
        <span className="pipeline__agent-name">{agent.name}</span>
        <span className={`pipeline__agent-tier pipeline__agent-tier--${agent.tier}`}>{agent.tier}</span>
        <span className="pipeline__agent-expand">{expanded ? '−' : '+'}</span>
      </header>
      {expanded && (
        <div className="pipeline__agent-body">
          <Field label="call pattern" value={agent.call_pattern} />
          <Field label="inputs" value={agent.inputs} />
          <Field label="outputs" value={agent.outputs} />
          {agent.tool_name && <Field label="tool" value={agent.tool_name} />}
          {agent.notes && <Field label="notes" value={agent.notes} />}
          <div className="pipeline__agent-prompt-label">prompt</div>
          <pre className="pipeline__agent-prompt">{agent.prompt}</pre>
        </div>
      )}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="pipeline__field">
      <span className="pipeline__field-label">{label}</span>
      <span className="pipeline__field-value">{value}</span>
    </div>
  );
}
