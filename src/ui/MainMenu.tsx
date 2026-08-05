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
        <button type="button" className="mainmenu__btn mainmenu__btn--primary" onClick={onDemo}>
          demo
        </button>
        <button type="button" className="mainmenu__btn" onClick={onXray}>
          xray lab
        </button>
        <button type="button" className="mainmenu__btn" onClick={onSettings}>
          settings
        </button>
      </div>
    </div>
  );
}
