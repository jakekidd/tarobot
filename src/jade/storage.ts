// Local persistence for the edited tree. Every change writes immediately,
// so a reload never loses progress. On load, prefer the stored copy over
// the bundled defaults — the friend is iterating on her version, not the
// shipped one.

import bundled from '../pipeline/survey/tree.json';
import type { DialogueTree } from '../pipeline/survey';

const TREE_KEY = 'tarobot:jade:tree';

/** Bundled tree.json — the source-of-truth defaults. */
export const BUNDLED_TREE: DialogueTree = bundled as unknown as DialogueTree;

export function loadJadeTree(): DialogueTree {
  try {
    const raw = localStorage.getItem(TREE_KEY);
    if (!raw) return clone(BUNDLED_TREE);
    const parsed = JSON.parse(raw) as DialogueTree;
    if (!parsed?.nodes || !parsed.roots) return clone(BUNDLED_TREE);
    return parsed;
  } catch {
    return clone(BUNDLED_TREE);
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

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
