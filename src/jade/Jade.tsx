// Jade — the secret survey/persona editor. Tiny internal page router:
//
//   home    → JadeHome (greeting + docs + EDITORS buttons)
//   survey  → JadeList  (the actual tree editor)
//   persona → JadePersona (placeholder)
//
// Topbar:
//   - on home   → brand "jade · home" left  · only EXIT right
//   - on survey → "← back" left              · EXPORT · RESET · EXIT right
//   - on persona → "← back" left             · EXIT right
//
// All tree state lives at this level so it persists across page navigations.
// Saves to localStorage AND pushes live to the survey engine on every change.

import { useCallback, useEffect, useState } from 'react';
import type { DialogueTree } from '../pipeline/survey';
import { JadeHome } from './JadeHome';
import { JadeList } from './JadeList';
import { JadePersona } from './JadePersona';
import {
  downloadJadeTree,
  loadJadeTree,
  resetJadeTree,
  saveJadeTree,
} from './storage';

type Props = {
  onExit: () => void;
};

type Page = 'home' | 'survey' | 'persona';

export function Jade({ onExit }: Props) {
  const [page, setPage] = useState<Page>('home');
  const [tree, setTreeState] = useState<DialogueTree>(() => loadJadeTree());

  const setTree = useCallback((updater: (prev: DialogueTree) => DialogueTree) => {
    setTreeState(updater);
  }, []);

  useEffect(() => {
    saveJadeTree(tree);
  }, [tree]);

  // While Jade is mounted, hide the main app's TarobotScene + CRT overlay.
  useEffect(() => {
    document.body.classList.add('jade-mode');
    return () => { document.body.classList.remove('jade-mode'); };
  }, []);

  function handleExport(): void {
    downloadJadeTree(tree, 'tree.json');
  }

  function handleReset(): void {
    if (!confirm('are you sure? all your local edits will be wiped and the bundled survey will come back.')) return;
    const fresh = resetJadeTree();
    setTreeState(fresh);
  }

  return (
    <div className="jade">
      <header className="jade__topbar">
        <div className="jade__brand">
          {page === 'home' ? (
            <>
              <span className="jade__brand-name">jade</span>
              <span className="jade__brand-sub">home</span>
            </>
          ) : (
            <button
              type="button"
              className="jade__back"
              onClick={() => setPage('home')}
              aria-label="back to jade home"
            >
              ← BACK
            </button>
          )}
        </div>
        <div className="jade__actions">
          {page === 'survey' && (
            <>
              <span className="jade__saved" title="autosaved to localStorage on every change">
                autosaved
              </span>
              <button className="jade__btn" onClick={handleExport}>EXPORT</button>
              <button className="jade__btn jade__btn--quiet" onClick={handleReset}>RESET</button>
            </>
          )}
          <button className="jade__btn jade__btn--quiet" onClick={onExit}>EXIT</button>
        </div>
      </header>

      <main className="jade__main">
        {page === 'home' && (
          <JadeHome
            onOpenSurvey={() => setPage('survey')}
            onOpenPersona={() => setPage('persona')}
          />
        )}
        {page === 'survey' && <JadeList tree={tree} setTree={setTree} />}
        {page === 'persona' && <JadePersona />}
      </main>

      <div className="jade__too-small">
        <p>jade is desktop only. resize your window wider (≥720px).</p>
      </div>
    </div>
  );
}
