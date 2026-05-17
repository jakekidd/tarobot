// Dialogue tree loader, validator, and question renderer.
//
// The tree is authored in tree.json (directed graph format documented in
// the file's _doc block). This module is the boundary between the raw JSON
// and the engine — it parses, validates references, and renders questions
// for the UI with substitution applied.

import treeData from './tree.json';
import type {
  AnswerFormat,
  DialogueTree,
  RenderedQuestion,
  SurveyProfile,
  TreeNode,
} from './types';
import { substituteOrBlank, substituteOrNull } from './substitution';

const BUNDLED_TREE = treeData as unknown as DialogueTree;

// The active tree. Defaults to the bundled tree.json (validated at module
// load — loud failure if the bundled defaults are broken). Can be swapped
// at runtime via setActiveTree() — used by the Jade editor so the live
// survey picks up the user's local edits without a rebuild.
//
// `let` not `const`: ES module live bindings mean importers of `TREE`
// transparently see the new value after a swap. The pipeline-portability
// rule still holds — this module never imports from outside `pipeline/`.
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

/** The relevant `interp` entries for a given pick — keyed and meta variants. */
export function relevantInterp(
  node_id: string,
  answer: string | string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const keys: string[] = [];
  if (Array.isArray(answer)) {
    for (const a of answer) keys.push(`${node_id}.${a}`);
    keys.push(`${node_id}._meta`);
    keys.push(`${node_id}._combos`);
  } else {
    keys.push(`${node_id}.${answer}`);
  }
  for (const k of keys) {
    const v = TREE.interp[k];
    if (v) out[k] = v;
  }
  return out;
}

/** Read-only helpers for callers that don't want to import the tree directly. */
export function getNode(node_id: string): TreeNode | null {
  return TREE.nodes[node_id] ?? null;
}

/** Every node id that's NOT in openers — these make up the investigator's pool. */
export function getPoolNodeIds(): string[] {
  const openerSet = new Set(TREE.openers);
  return Object.keys(TREE.nodes).filter((id) => !openerSet.has(id));
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

export function getInterp(key: string): string | undefined {
  return TREE.interp[key];
}

export type { AnswerFormat };
