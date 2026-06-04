// SurveyDone — the end of this pass. The TuningEngine that would consume the
// RawPortrait isn't wired yet, so instead of continuing we dump the raw
// object as plaintext with a copy button. This is the iteration surface:
// run the survey as yourself, read what you produced, tune the channels in
// materials/survey.json, re-run.

import { useState } from 'react';
import type { RawPortrait } from '../../pipeline/introduction-survey';
import './survey.css';

type Props = {
  raw: RawPortrait;
  onExit: () => void;
};

export function SurveyDone({ raw, onExit }: Props) {
  const json = JSON.stringify(raw, null, 2);
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="survey-done">
      <div className="survey-done__bar">
        <span className="survey-done__title">
          done · raw portrait · {raw.facets.length} facets · {raw.identity.name || 'anon'}
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
