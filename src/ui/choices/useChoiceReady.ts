// Anti-double-submit guard for choice components.
//
// When a question transitions, React unmounts the previous MultipleChoice
// and mounts a fresh one (forced via key={node_id} in Antechamber.tsx). The new
// component starts with no `pickedIdx`, so a stray tap that lands within
// ~100–300ms of mount fires through as an answer to the NEW question —
// even though the user thought they were still hammering the old one.
//
// Symptom: "undo jumps too far back when user rushes" — they meant to
// undo one question and find themselves two back, because they
// inadvertently submitted twice.
//
// This hook returns `ready = false` for the first `delayMs` after mount;
// callers wire that into the buttons' `disabled` prop. Deliberate users
// won't notice (250ms is shorter than read+decide+tap), but rush-tappers
// hit a disabled button and the submit drops cleanly.

import { useEffect, useState } from 'react';

export function useChoiceReady(delayMs = 250): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);
  return ready;
}
