// TuningDone — the end of the conjector pass. The Compiler that would consume
// the antechamber's output isn't built yet, so we dump the full
// AntechamberOutput bundle (identity + picks + the Portrait the hunt ran off
// + the banked dilemmas) as plaintext with a copy button. The iteration
// surface for the conjector: run it as yourself, read what it banked against
// the Portrait it hunted from, tune the prompts in
// materials/prompts/conjector/, re-run. Reuses the survey-done chrome.

import { useState } from 'react';
import type { AntechamberOutput } from '../../pipeline/tuning';
import '../survey/survey.css';

type Props = {
  output: AntechamberOutput;
  onExit: () => void;
};

export function TuningDone({ output, onExit }: Props) {
  const json = JSON.stringify(output, null, 2);
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  const confirmed = output.dilemmas.filter((d) => d.confirmed).length;

  return (
    <div className="survey-done">
      <div className="survey-done__bar">
        <span className="survey-done__title">
          done · {output.dilemmas.length} dilemma{output.dilemmas.length === 1 ? '' : 's'} · {confirmed} confirmed · {output.ended}
        </span>
        <div className="survey-done__actions">
          <button type="button" className="btn btn--chrome" onClick={copy}>
            {copied ? 'copied ✓' : 'copy'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={onExit}>
            menu
          </button>
        </div>
      </div>
      <pre className="survey-done__json">{json}</pre>
    </div>
  );
}
