// TuningDone — the end of the conjector pass. The Compiler that would consume
// the dilemmas isn't wired yet, so we dump the ConjectorResult as plaintext
// with a copy button. The iteration surface for the conjector: run it as
// yourself, read the dilemmas it banked, tune the prompts in
// materials/prompts/conjector/, re-run. Reuses the survey-done chrome.

import { useState } from 'react';
import type { ConjectorResult } from '../../pipeline/tuning';
import '../survey/survey.css';

type Props = {
  result: ConjectorResult;
  onExit: () => void;
};

export function TuningDone({ result, onExit }: Props) {
  const json = JSON.stringify(result, null, 2);
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  const confirmed = result.dilemmas.filter((d) => d.confirmed).length;

  return (
    <div className="survey-done">
      <div className="survey-done__bar">
        <span className="survey-done__title">
          done · {result.dilemmas.length} dilemma{result.dilemmas.length === 1 ? '' : 's'} · {confirmed} confirmed
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
