// Jade — the secret survey editor. Designer's sandbox: visualize the
// dialogue tree as a 3D graph, click nodes to edit their text/format/
// answers, auto-save to localStorage on every change, download the
// edited tree as JSON when ready.
//
// Lives entirely under src/jade/. Imports only from pipeline/survey/
// (for types + the bundled default tree). Does not touch survey/reading
// engines, the Anthropic SDK, or any of the main app's stores.

import { useCallback, useEffect, useState } from 'react';
import type { DialogueTree, TreeNode } from '../pipeline/survey';
import { JadeScene } from './JadeScene';
import { JadeEditor } from './JadeEditor';
import {
  downloadJadeTree,
  loadJadeTree,
  resetJadeTree,
  saveJadeTree,
} from './storage';

type Props = {
  onExit: () => void;
};

export function Jade({ onExit }: Props) {
  const [tree, setTree] = useState<DialogueTree>(() => loadJadeTree());
  const [selected, setSelected] = useState<string | null>(null);

  // Auto-save on every tree change. saveJadeTree() runs synchronously, so
  // by the time React commits the new state it's already persisted.
  useEffect(() => {
    saveJadeTree(tree);
  }, [tree]);

  const updateNode = useCallback((id: string, patch: Partial<TreeNode>) => {
    setTree((prev) => {
      const node = prev.nodes[id];
      if (!node) return prev;
      return {
        ...prev,
        nodes: { ...prev.nodes, [id]: { ...node, ...patch } },
      };
    });
  }, []);

  function handleDownload(): void {
    downloadJadeTree(tree, 'tree.json');
  }

  function handleReset(): void {
    if (!confirm('reset to the bundled tree.json? all your edits will be lost.')) return;
    const fresh = resetJadeTree();
    setTree(fresh);
    setSelected(null);
  }

  // Hide the main app's full-viewport TarobotScene canvas while we're in
  // here — Jade has its own scene and we don't want Clat bleeding through.
  useEffect(() => {
    document.body.classList.add('jade-mode');
    return () => { document.body.classList.remove('jade-mode'); };
  }, []);

  return (
    <div className="jade">
      <header className="jade__topbar">
        <div className="jade__brand">
          <span className="jade__brand-name">jade</span>
          <span className="jade__brand-sub">tree editor — {Object.keys(tree.nodes).length} nodes</span>
        </div>
        <div className="jade__actions">
          <span className="jade__saved" title="autosaved to localStorage on every change">
            autosaved
          </span>
          <button className="jade__btn" onClick={handleDownload}>DOWNLOAD</button>
          <button className="jade__btn jade__btn--quiet" onClick={handleReset}>RESET</button>
          <button className="jade__btn jade__btn--quiet" onClick={onExit}>EXIT</button>
        </div>
      </header>

      <main className="jade__main">
        <div className="jade__canvas-wrap">
          <JadeScene tree={tree} selected={selected} onSelect={setSelected} />
        </div>
        <JadeEditor tree={tree} selectedId={selected} onUpdate={updateNode} />
      </main>

      <div className="jade__too-small">
        <p>jade is desktop only. resize your window wider (≥1280px).</p>
      </div>
    </div>
  );
}
