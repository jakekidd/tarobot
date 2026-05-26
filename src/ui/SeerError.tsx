// Pretty error UI for when the seer pipeline faults (schema mismatch,
// network blip, etc.). Replaces the raw error text we used to dump
// into a red div. Gives the user:
//   - a compressed human reason ("the seer faltered while preparing
//     a card")
//   - COPY ERROR → full stack/details to clipboard
//   - DOWNLOAD TRANSCRIPT → full .md log w/ Q&A + agent traces, so
//     jade can send it back as QA info
//
// The eyes in TarobotScene render as X's whenever this is mounted —
// driven by seerErrorStore.

import { useEffect, useState } from 'react';
import { copyTranscriptToClipboard, downloadTranscript } from '../debug/transcript';

type Props = {
  error: string;
};

// Compress the raw error into a one-liner the user can read without
// understanding it. The full thing stays available via COPY ERROR.
function humanizeError(raw: string): string {
  if (/prepare_set/i.test(raw)) {
    return 'the seer stumbled while preparing a card';
  }
  if (/^\s*seeder\b|seeder failed/i.test(raw)) {
    return 'the seeder\'s notes came back malformed';
  }
  if (/^\s*detective\b|detective pass failed|detective_text/i.test(raw)) {
    return 'the detective\'s output didn\'t parse';
  }
  if (/^\s*psych\b|psych pass failed/i.test(raw)) {
    return 'the psych curator stumbled';
  }
  if (/compiler_write_dilemma|compiler failed/i.test(raw)) {
    return 'the compiler couldn\'t resolve a dilemma';
  }
  if (/intro|director_intro/i.test(raw)) {
    return 'the seer couldn\'t compose her opening';
  }
  if (/closing|outro|director_closing/i.test(raw)) {
    return 'the seer\'s closing thought tripped';
  }
  if (/augur/i.test(raw)) {
    return 'the augur couldn\'t name the outcomes';
  }
  if (/fetch|network|timeout/i.test(raw)) {
    return 'connection trouble — the model didn\'t respond';
  }
  if (/api[_\s-]?key|401|403/i.test(raw)) {
    return 'the api key was rejected';
  }
  return 'something went wrong in the reading';
}

export function SeerError({ error }: Props) {
  const [copied, setCopied] = useState(false);
  const friendly = humanizeError(error);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  function handleCopyError() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(error)
      .then(() => setCopied(true))
      .catch(() => { /* swallow */ });
  }

  return (
    <div className="seer-error" role="alert">
      <div className="seer-error__line">{friendly}.</div>
      <details className="seer-error__details">
        <summary>show raw error</summary>
        <pre>{error}</pre>
      </details>
      <div className="seer-error__actions">
        <button
          type="button"
          className="seer-error__btn seer-error__btn--copy"
          onClick={handleCopyError}
        >
          {copied ? 'copied' : 'copy error'}
        </button>
        <button
          type="button"
          className="seer-error__btn seer-error__btn--download"
          onClick={downloadTranscript}
          title="download a markdown transcript with all Q&A + agent traces"
        >
          download transcript
        </button>
        <button
          type="button"
          className="seer-error__btn"
          onClick={copyTranscriptToClipboard}
          title="copy the full transcript to clipboard"
        >
          copy transcript
        </button>
      </div>
    </div>
  );
}
