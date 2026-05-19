// Dialogue tree loader, validator, and question renderer.
//
// The survey is authored in `SURVEY.md` (sibling file). Edits there ship
// straight to production — Jade can edit the markdown on GitHub, push,
// and Vercel rebuilds with the new questions. This module is the
// boundary between the raw markdown and the engine: parses, validates,
// renders questions with substitution applied.

import surveyMdSource from './SURVEY.md?raw';
import { parseSurveyMd } from './parseSurveyMd';
import type {
  AnswerFormat,
  DialogueTree,
  RenderedQuestion,
  SurveyProfile,
  TreeNode,
} from './types';
import { substituteOrBlank, substituteOrNull } from './substitution';

const BUNDLED_TREE: DialogueTree = parseSurveyMd(surveyMdSource);

// The active tree. Defaults to the bundled SURVEY.md (validated at
// module load — loud failure if the markdown is broken). `setActiveTree`
// is retained for the Jade live-edit codepath but the engine no longer
// applies overrides — see jade/storage.ts.
//
// `let` not `const`: ES module live bindings mean importers of `TREE`
// transparently see the new value after a swap.
export let TREE: DialogueTree = (() => {
  validateTree(BUNDLED_TREE);
  return BUNDLED_TREE;
})();

let usingOverride = false;
const overrideListeners = new Set<() => void>();

/** Subscribe to override-state changes. Returns an unsubscribe fn. */
export function subscribeToOverrideChanges(listener: () => void): () => void {
  overrideListeners.add(listener);
  return () => { overrideListeners.delete(listener); };
}

/**
 * Swap the active tree at runtime. Validates the candidate first; on
 * failure logs a warning and leaves TREE untouched so a malformed edit
 * in the editor can never break the live survey.
 *
 * Pass `null` (or omit `tree`) to restore the bundled defaults.
 */
export function setActiveTree(tree: DialogueTree | null): void {
  const before = usingOverride;
  if (!tree) {
    TREE = BUNDLED_TREE;
    usingOverride = false;
  } else {
    try {
      validateTree(tree);
    } catch (err) {
      console.warn('[tree] setActiveTree rejected — validation failed:', err);
      return;
    }
    TREE = tree;
    usingOverride = !shallowEqualTree(tree, BUNDLED_TREE);
  }
  if (before !== usingOverride) {
    for (const fn of overrideListeners) {
      try { fn(); } catch { /* swallow */ }
    }
  }
}

/** True iff the active tree is something other than the bundled defaults. */
export function isUsingTreeOverride(): boolean {
  return usingOverride;
}

/** The bundled tree.json contents — never mutated; safe to use as a baseline. */
export function getBundledTree(): DialogueTree {
  return BUNDLED_TREE;
}

function shallowEqualTree(a: DialogueTree, b: DialogueTree): boolean {
  // Cheap version-based check first.
  if (a.v !== b.v) return false;
  // Fall back to a structural compare on the parts that matter.
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Structural validation:
 *   • every opener in `openers[]` exists in `nodes`
 *   • every node has a `topic` that appears in `topics[]`
 *
 * Throws with a clear message on failure. Designed for dev-time loud failure.
 */
export function validateTree(tree: DialogueTree): void {
  const nodeIds = new Set(Object.keys(tree.nodes));
  const topicIds = new Set(tree.topics);

  for (const opener of tree.openers) {
    if (!nodeIds.has(opener)) {
      throw new Error(`tree: openers[] contains '${opener}' but no such node exists`);
    }
  }

  if (!Array.isArray(tree.pillars)) {
    throw new Error('tree: pillars[] missing — required since v0.7.0');
  }
  for (const pillar of tree.pillars) {
    if (!nodeIds.has(pillar)) {
      throw new Error(`tree: pillars[] contains '${pillar}' but no such node exists`);
    }
    if (tree.openers.includes(pillar)) {
      throw new Error(`tree: '${pillar}' appears in BOTH openers[] and pillars[] — must be one or the other`);
    }
  }

  for (const [id, node] of Object.entries(tree.nodes)) {
    if (!node.topic) {
      throw new Error(`tree: node '${id}' is missing a topic`);
    }
    if (!topicIds.has(node.topic)) {
      throw new Error(`tree: node '${id}'.topic = '${node.topic}' is not in topics[]`);
    }
  }
}

// ─── Rendering ──────────────────────────────────────────

/**
 * Build the UI-ready question shape from a node id + the current profile.
 * Applies text substitution and flattens answer tuples to a plain options
 * list.
 */
/** Binary always offers the same three options — locked here so neither
 *  the tree author nor the investigator can drift them. */
export const BINARY_OPTIONS = ['yes', 'no', 'sometimes'] as const;

export function renderQuestion(
  node_id: string,
  profile: SurveyProfile,
  preambleRaw?: string,
  /** Investigator-overridden options (only respected for `choice` format). */
  overrideOptions?: string[],
): RenderedQuestion {
  const node = TREE.nodes[node_id];
  if (!node) {
    throw new Error(`tree: cannot render unknown node '${node_id}'`);
  }
  const text = substituteOrBlank(node.q, profile);
  // Format-locked options:
  //   binary → ALWAYS [yes, no, sometimes]; investigator + node ignored.
  //   choice → investigator override wins; otherwise node's `a` field.
  //   matrix → node's `a` field; investigator override ignored.
  //   text/date → no options.
  let options: string[];
  if (node.f === 'binary') {
    options = [...BINARY_OPTIONS];
  } else if (node.f === 'choice' && overrideOptions && overrideOptions.length > 0) {
    options = overrideOptions;
  } else {
    options = extractOptionLabels(node);
  }
  const preamble = preambleRaw ? (substituteOrNull(preambleRaw, profile) ?? undefined) : undefined;

  return {
    node_id,
    text,
    format: node.f,
    options,
    axes: node.axes,
    preamble: preamble && preamble.length > 0 ? preamble : undefined,
  };
}

/** Just the label (first tuple slot) from each answer. */
export function extractOptionLabels(node: TreeNode): string[] {
  if (!node.a) return [];
  return node.a.map((t) => t[0]);
}

/**
 * Look up the inline comment associated with a specific answer choice.
 * Returns the raw (un-substituted) comment or null if no comment is set.
 */
export function commentForAnswer(node: TreeNode, answer: string): string | null {
  if (!node.a) return null;
  const match = node.a.find((t) => t[0] === answer);
  if (!match) return null;
  return match[1] && match[1].length > 0 ? match[1] : null;
}

// relevantInterp / per-answer interp removed when the survey moved to
// SURVEY.md. Per-question `probe` (decoder hook) replaced it; the
// detective now reads probe directly via the payload.

/** Read-only helpers for callers that don't want to import the tree directly. */
export function getNode(node_id: string): TreeNode | null {
  return TREE.nodes[node_id] ?? null;
}

/** Every node id that's NOT an opener AND NOT a Pillar — the random
 *  pool the queue draws from for non-Pillar slots. */
export function getPoolNodeIds(): string[] {
  const reserved = new Set([...TREE.openers, ...TREE.pillars]);
  return Object.keys(TREE.nodes).filter((id) => !reserved.has(id));
}

export function getTopics(): string[] {
  return TREE.topics.slice();
}

export function getNodesByTopic(topic: string): string[] {
  return Object.keys(TREE.nodes).filter((id) => TREE.nodes[id]?.topic === topic);
}

export function getOpeners(): string[] {
  return TREE.openers.slice();
}

/** The static 6 Pillar questions, in order. Asked immediately after
 *  openers complete. Pipeline DOES fire on Pillar answers. */
export function getPillars(): string[] {
  return TREE.pillars.slice();
}

export type { AnswerFormat };
