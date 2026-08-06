// The main menu — three doors: the demo (the full 3d session), the
// xray lab (the debug surface), settings. The old turtle world is dead
// code behind this; git history is the archive.

import './main-menu.css';

type Props = {
  onDemo: () => void;
  onXray: () => void;
  onSettings: () => void;
};

export function MainMenu({ onDemo, onXray, onSettings }: Props) {
  return (
    <div className="mainmenu">
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
  );
}
