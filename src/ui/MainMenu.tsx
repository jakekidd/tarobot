// The main menu — three doors: the demo (the full 3d session), the
// xray lab (the debug surface), settings. The turtle swims the void
// behind the doors (MenuScene); the old turtle WORLD stays dead code —
// git history is the archive.

import './main-menu.css';
import { useEffect, useRef } from 'react';
import { MenuScene } from './MenuScene';

type Props = {
  onDemo: () => void;
  onXray: () => void;
  onSettings: () => void;
};

export function MainMenu({ onDemo, onXray, onSettings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new MenuScene(canvasRef.current!);
    return () => scene.dispose();
  }, []);

  return (
    <div className="mainmenu">
      <canvas ref={canvasRef} className="mainmenu__scene" />
      <div className="mainmenu__panel">
        <div className="mainmenu__title">tarobot</div>
        <div className="mainmenu__sub">the oracle is in</div>
        <div className="mainmenu__buttons">
          <button type="button" className="mainmenu__btn mainmenu__btn--begin" onClick={onDemo}>
            begin
          </button>
          <button type="button" className="mainmenu__btn" onClick={onXray}>
            xray bench
          </button>
          <button type="button" className="mainmenu__btn" onClick={onSettings}>
            settings
          </button>
          {/* TRANSCRIPTS (4th door, deferred): download full session logs
              from localStorage — needs session persistence first (records
              run 1-3MB each vs the 5MB quota). TODO.md has the entry. */}
        </div>
      </div>
      <div className="crt-overlay" aria-hidden>
        <div className="crt__scanlines" />
        <div className="crt__vignette" />
        <div className="crt__aberration" />
        <div className="crt__flicker" />
      </div>
    </div>
  );
}
