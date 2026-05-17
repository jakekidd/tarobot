// Jade — the secret survey editor. Designer's sandbox. Straight-up list
// of every dialogue node, expand to edit inline. Autosaves to
// localStorage on every change AND pushes the change live to the survey
// engine, so the next survey run uses the local copy.
//
// Lives entirely under src/jade/. Imports only from pipeline/survey/
// (for types + the bundled default tree + setActiveTree).

import { useCallback, useEffect, useState } from 'react';
import type { DialogueTree } from '../pipeline/survey';
import { JadeList } from './JadeList';
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
  const [tree, setTreeState] = useState<DialogueTree>(() => loadJadeTree());

  // Wrapper that takes an updater function and auto-persists.
  const setTree = useCallback((updater: (prev: DialogueTree) => DialogueTree) => {
    setTreeState(updater);
  }, []);

  // Every tree change: save to localStorage AND push live to the survey
  // engine. saveJadeTree() handles both.
  useEffect(() => {
    saveJadeTree(tree);
  }, [tree]);

  // While Jade is mounted, hide the main app's TarobotScene + CRT overlay
  // (jade.css does this via body.jade-mode).
  useEffect(() => {
    document.body.classList.add('jade-mode');
    return () => { document.body.classList.remove('jade-mode'); };
  }, []);

  function handleExport(): void {
    downloadJadeTree(tree, 'tree.json');
  }

  function handleReset(): void {
    if (!confirm('reset to the bundled tree.json? all your local edits will be lost.')) return;
    const fresh = resetJadeTree();
    setTreeState(fresh);
  }

  return (
    <div className="jade">
      <header className="jade__topbar">
        <div className="jade__brand">
          <span className="jade__brand-name">jade</span>
          <span className="jade__brand-sub">survey editor</span>
        </div>
        <div className="jade__actions">
          <span className="jade__saved" title="autosaved to localStorage on every change">
            autosaved
          </span>
          <button className="jade__btn" onClick={handleExport}>EXPORT</button>
          <button className="jade__btn jade__btn--quiet" onClick={handleReset}>RESET</button>
          <button className="jade__btn jade__btn--quiet" onClick={onExit}>EXIT</button>
        </div>
      </header>

      <main className="jade__main">
        <JadeList tree={tree} setTree={setTree} />
      </main>

      <div className="jade__too-small">
        <p>jade is desktop only. resize your window wider (≥720px).</p>
      </div>
    </div>
  );
}
