// Local persistence for the Jade-edited tree. The Jade UI uses this to
// preserve in-progress edits across reloads and to export JSON.
//
// IMPORTANT: the engine does NOT read this storage. The survey always
// runs against the bundled tree.json. Jade is an authoring tool; pushing
// edits live to the engine was an earlier experiment and has been
// withdrawn. To deploy a Jade edit, export the JSON and replace
// src/pipeline/survey/tree.json in the repo.

import bundled from '../pipeline/survey/tree.json';
import type { DialogueTree } from '../pipeline/survey';

const TREE_KEY = 'tarobot:jade:tree';

/** Bundled tree.json — the source-of-truth defaults. */
export const BUNDLED_TREE: DialogueTree = bundled as unknown as DialogueTree;

export function loadJadeTree(): DialogueTree {
  const stored = loadStoredTree();
  return stored ?? clone(BUNDLED_TREE);
}

/** Returns the stored tree if one exists, null otherwise. */
function loadStoredTree(): DialogueTree | null {
  try {
    const raw = localStorage.getItem(TREE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DialogueTree;
    if (!parsed?.nodes || !parsed.openers || !parsed.topics) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveJadeTree(tree: DialogueTree): void {
  try {
    localStorage.setItem(TREE_KEY, JSON.stringify(tree));
  } catch {
    /* quota or private mode — silent for now */
  }
}

export function resetJadeTree(): DialogueTree {
  try {
    localStorage.removeItem(TREE_KEY);
  } catch {
    /* ignore */
  }
  return clone(BUNDLED_TREE);
}

export function downloadJadeTree(tree: DialogueTree, filename = 'tree.json'): void {
  const blob = new Blob([JSON.stringify(tree, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Called once at app boot from main.tsx. The engine override path has
 * been withdrawn; this function now performs a one-time cleanup —
 * wipes any previously-saved Jade tree from localStorage so it can't
 * silently affect the live survey via stale code paths.
 *
 * Safe to call repeatedly; only the FIRST call actually removes data.
 */
export function applyJadeOverrideAtBoot(): void {
  try {
    localStorage.removeItem(TREE_KEY);
  } catch {
    /* ignore */
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
