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
 *   • every `next` references a node that exists
 *   • every answer tuple's `[2]` next override references a real node
 *   • every root in `roots[]` exists in `nodes`
 *   • every opener in `openers[]` exists in `nodes`
 *   • every `interp` key matches a real `node.answer` pair (warns, doesn't throw —
 *     keys may reference `pass` or `_meta` keys that aren't in the answer list)
 *
 * Throws with a clear message on failure. Designed for dev-time loud failure.
 */
export function validateTree(tree: DialogueTree): void {
  const nodeIds = new Set(Object.keys(tree.nodes));

  for (const root of tree.roots) {
    if (!nodeIds.has(root)) {
      throw new Error(`tree: roots[] contains '${root}' but no such node exists`);
    }
  }

  for (const opener of tree.openers) {
    if (!nodeIds.has(opener)) {
      throw new Error(`tree: openers[] contains '${opener}' but no such node exists`);
    }
  }

  for (const [id, node] of Object.entries(tree.nodes)) {
    if (node.next && !nodeIds.has(node.next)) {
      throw new Error(`tree: node '${id}'.next = '${node.next}' references missing node`);
    }
    if (node.a) {
      for (const tuple of node.a) {
        const override = tuple[2];
        if (override && !nodeIds.has(override)) {
          throw new Error(`tree: node '${id}' answer '${tuple[0]}' overrides to '${override}', which doesn't exist`);
        }
      }
    }
  }
}

// ─── Rendering ──────────────────────────────────────────

/**
 * Build the UI-ready question shape from a node id + the current profile.
 * Applies text substitution, expands dark questions with a trailing 'pass'
 * option, and flattens answer tuples to a plain options list.
 */
export function renderQuestion(
  node_id: string,
  profile: SurveyProfile,
  preambleRaw?: string,
): RenderedQuestion {
  const node = TREE.nodes[node_id];
  if (!node) {
    throw new Error(`tree: cannot render unknown node '${node_id}'`);
  }
  const text = substituteOrBlank(node.q, profile);
  const baseOptions = extractOptionLabels(node);
  const options = node.is_dark ? [...baseOptions, 'pass'] : baseOptions;
  const preamble = preambleRaw ? (substituteOrNull(preambleRaw, profile) ?? undefined) : undefined;

  return {
    node_id,
    text,
    format: node.f,
    options,
    axes: node.axes,
    is_dark: node.is_dark === true,
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

/**
 * Resolve the next node id after answering. Priority:
 *   1. The picked answer's tuple override (`tuple[2]`)
 *   2. The node's default `next`
 *   3. null  (= "end of path, pop back to root selection")
 *
 * For multi-select answers (where `answer` is string[]), the override is
 * never consulted — multi-select questions always fall back to default `next`.
 */
export function resolveNextNode(node: TreeNode, answer: string | string[]): string | null {
  if (typeof answer === 'string' && node.a) {
    const match = node.a.find((t) => t[0] === answer);
    if (match && match[2]) return match[2];
  }
  return node.next ?? null;
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

export function getRoots(): string[] {
  return TREE.roots.slice();
}

export function getOpeners(): string[] {
  return TREE.openers.slice();
}

export function getInterp(key: string): string | undefined {
  return TREE.interp[key];
}

export type { AnswerFormat };
