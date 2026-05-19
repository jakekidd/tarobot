// Local persistence for the Jade-edited tree. The Jade UI is now a
// VIEWER on top of the bundled survey (sourced from SURVEY.md). It can
// still snapshot edits to localStorage and export JSON for inspection,
// but those edits don't affect the live engine — the source of truth
// is the markdown doc at src/pipeline/survey/SURVEY.md.

import { getBundledTree } from '../pipeline/survey';
import type { DialogueTree } from '../pipeline/survey';

const TREE_KEY = 'tarobot:jade:tree';

/** The bundled tree as parsed from SURVEY.md. */
export const BUNDLED_TREE: DialogueTree = getBundledTree();

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
