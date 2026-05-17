// Local persistence for the edited tree. Every change writes immediately,
// so a reload never loses progress. On load, prefer the stored copy over
// the bundled defaults — the friend is iterating on her version, not the
// shipped one.
//
// The survey engine consumes the active tree via `setActiveTree()` in
// pipeline/survey/tree.ts. We push to it at:
//   - app boot (applyJadeOverrideAtBoot, called from main.tsx)
//   - every Jade save (saveJadeTree → also pushes live)

import bundled from '../pipeline/survey/tree.json';
import type { DialogueTree } from '../pipeline/survey';
import { setActiveTree } from '../pipeline/survey';

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
    if (!parsed?.nodes || !parsed.roots) return null;
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
  // Push live to the survey engine so any open survey instance picks up
  // the change without a reload.
  setActiveTree(tree);
}

export function resetJadeTree(): DialogueTree {
  try {
    localStorage.removeItem(TREE_KEY);
  } catch {
    /* ignore */
  }
  setActiveTree(null); // restore bundled defaults
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
 * Called once at app boot from main.tsx. Checks localStorage for a saved
 * tree and, if present, hands it to the survey engine BEFORE any survey
 * UI mounts. Safe no-op if nothing is stored.
 */
export function applyJadeOverrideAtBoot(): void {
  const stored = loadStoredTree();
  if (stored) setActiveTree(stored);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
