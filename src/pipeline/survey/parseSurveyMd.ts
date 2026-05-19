// Markdown → DialogueTree parser.
//
// The survey is authored in `SURVEY.md` (sibling file). This module converts
// that markdown into the in-memory DialogueTree shape the engine consumes.
// The full schema is documented at the top of SURVEY.md itself.
//
// Format (recap):
//   ## Pillars
//   ### {question text — the heading IS the question}
//   Format: choice|binary|matrix|relationship_pick
//   Probe: short note to the detective (optional)
//   Options:
//     - first option
//     - second option :: optional inline comment
//
//   ## Pool
//   ### {topic}
//   #### {question text}
//   ... same fields as Pillars ...
//
// Entries named exactly `Template` (case-insensitive) are skipped — they
// exist in the doc as schema reference and never load into the engine.

import type { AnswerFormat, DialogueTree, TreeNode } from './types';

type ParsedQuestion = {
  id: string;
  heading: string;
  topic: string;
  node: TreeNode;
  isPillar: boolean;
};

const KNOWN_FORMATS: Record<string, AnswerFormat> = {
  text: 'text',
  date: 'date',
  choice: 'choice',
  binary: 'binary',
  matrix: 'matrix',
  intent: 'intent',
  relationship_pick: 'relationship_pick',
};

/** Public entry point. Parses the markdown source, validates structure,
 *  and returns a DialogueTree. Throws on schema violations so a broken
 *  edit fails loudly at boot instead of silently corrupting the survey. */
export function parseSurveyMd(source: string): DialogueTree {
  const lines = source.split('\n');
  const questions: ParsedQuestion[] = [];

  // State machine. Tracks which section / topic / question we're in.
  let section: 'none' | 'pillars' | 'pool' = 'none';
  let topic = '';
  let current: ParsedQuestion | null = null;
  let optionsMode = false;
  let axesMode = false;

  function commit() {
    if (current) {
      questions.push(current);
      current = null;
    }
    optionsMode = false;
    axesMode = false;
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');

    // ## Pillars / ## Pool toggles the section.
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      commit();
      const t = h2[1]!.toLowerCase();
      if (t === 'pillars') section = 'pillars';
      else if (t === 'pool') section = 'pool';
      else section = 'none';
      topic = '';
      continue;
    }

    // Inside Pool: ### {topic-name} is a topic header (no Question, just a label).
    // Inside Pillars: ### {question heading} is a question.
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      commit();
      const heading = h3[1]!.trim();
      if (section === 'pool') {
        topic = heading.toLowerCase();
        continue;
      }
      if (section === 'pillars') {
        if (heading.toLowerCase() === 'template') continue;
        current = startQuestion(heading, 'pillar', true);
      }
      continue;
    }

    // #### {question heading} inside Pool topics
    const h4 = line.match(/^####\s+(.+?)\s*$/);
    if (h4) {
      commit();
      const heading = h4[1]!.trim();
      if (heading.toLowerCase() === 'template') continue;
      if (section !== 'pool' || !topic) continue;
      current = startQuestion(heading, topic, false);
      continue;
    }

    if (!current) continue;

    // Field rows: `Format: ...`, `Probe: ...`, `Options:`, `Axes:`
    const field = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (field) {
      const key = field[1]!.toLowerCase();
      const val = field[2]!.trim();
      optionsMode = false;
      axesMode = false;
      if (key === 'format') {
        const fmt = KNOWN_FORMATS[val.toLowerCase()];
        if (!fmt) throw new Error(`SURVEY.md: unknown format '${val}' on question "${current.heading}"`);
        current.node.f = fmt;
      } else if (key === 'probe') {
        if (val) current.node.probe = val;
      } else if (key === 'options') {
        optionsMode = true;
      } else if (key === 'axes') {
        axesMode = true;
      }
      continue;
    }

    // Bulleted lines: belong to whichever block is currently active.
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      const item = bullet[1]!.trim();
      if (optionsMode) {
        const [option, comment] = splitOption(item);
        current.node.a = current.node.a ?? [];
        current.node.a.push(comment ? [option, comment] : [option]);
      } else if (axesMode) {
        const axis = item.match(/^(x|y)\s*:\s*(.+)$/i);
        if (axis) {
          const which = axis[1]!.toLowerCase() as 'x' | 'y';
          const [left, right] = axis[2]!.split('|').map((s) => s.trim());
          if (!left || !right) {
            throw new Error(`SURVEY.md: axis '${which}' on "${current.heading}" must be 'left | right'`);
          }
          const axes = (current.node.axes ?? [['', ''], ['', '']]) as [
            [string, string],
            [string, string],
          ];
          if (which === 'x') axes[0] = [left, right];
          else axes[1] = [left, right];
          current.node.axes = axes;
        }
      }
      continue;
    }

    // blank / prose line ends any active bullet block but keeps the question open
    if (/^\s*$/.test(line)) {
      optionsMode = false;
      axesMode = false;
    }
  }
  commit();

  // Build DialogueTree.
  const nodes: Record<string, TreeNode> = {};
  const pillars: string[] = [];
  const topicSet = new Set<string>(['intake']);
  const usedIds = new Set<string>(['name', 'birthday', 'intent']);

  for (const q of questions) {
    let id = q.id;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${q.id}-${suffix++}`;
    }
    usedIds.add(id);
    nodes[id] = q.node;
    topicSet.add(q.node.topic);
    if (q.isPillar) pillars.push(id);
  }

  // Openers are code-hardcoded (special UI per format). They're injected
  // here so the rest of the engine sees a complete DialogueTree.
  nodes.name = { topic: 'intake', q: 'what should i call you?', f: 'text' };
  nodes.birthday = {
    topic: 'intake',
    q: 'when were you born? the day, month, and year. time and location optional.',
    f: 'date',
  };
  nodes.intent = {
    topic: 'intake',
    q: 'do you have a question for the cards?',
    f: 'intent',
  };

  return {
    v: 'survey-md@1',
    topics: Array.from(topicSet),
    openers: ['name', 'birthday', 'intent'],
    pillars,
    nodes,
  };
}

// ─── helpers ───────────────────────────────────────────────

function startQuestion(heading: string, topic: string, isPillar: boolean): ParsedQuestion {
  return {
    id: slugify(heading),
    heading,
    topic: isPillar ? topicForPillar(heading) : topic,
    isPillar,
    node: {
      topic: isPillar ? topicForPillar(heading) : topic,
      q: heading.toLowerCase(),
      f: 'choice', // overwritten by Format: line; default keeps the type safe
    },
  };
}

/** Pillars don't carry an explicit topic in the markdown; the engine
 *  still groups them under conceptual topics so the detective gets a
 *  consistent payload shape. */
function topicForPillar(heading: string): string {
  const h = heading.toLowerCase();
  if (h.includes('decision')) return 'self';
  if (h.includes('important person')) return 'relational';
  if (h.includes('perceive')) return 'self';
  if (h.includes('value')) return 'self';
  if (h.includes('loudest')) return 'state';
  if (h.includes("used to think")) return 'self';
  return 'intake';
}

/** Lowercase, dash-separated, alnum only. Trims trailing dashes. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')                  // drop apostrophes
    .replace(/[^a-z0-9]+/g, '-')           // any other non-alnum → dash
    .replace(/^-+|-+$/g, '')               // trim dashes
    .slice(0, 80);                          // sanity cap
}

/** Splits `option text :: inline comment` into [option, comment]. */
function splitOption(s: string): [string, string?] {
  const idx = s.indexOf('::');
  if (idx < 0) return [s.trim()];
  return [s.slice(0, idx).trim(), s.slice(idx + 2).trim()];
}
