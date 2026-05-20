// Algorithmic end-of-survey extraction. Replaces LLM-emitted hooks and
// side_channel with deterministic transforms over picks_log + timing_log.
//
// Rationale: hooks are literally the user's answer phrases, and the LLM
// was producing empty arrays unreliably. Side-channel signals are pure
// telemetry (latency, initial != final, empty answers). Both belong to
// the engine, not to a model that has to re-discover them every turn.
//
// Called from engine.submitIntention() before Augur fires, so the
// finalized profile.hooks + profile.side_channel reach the Augur and
// the Seer.

import type { PickEvent, TimingEvent, SideChannel } from './types';
import { getOpeners } from './tree';

const OPENER_NODE_IDS = new Set<string>(getOpeners());

const FAST_PICK_MS = 1500;     // sub-1.5s pick = pre-loaded answer
const SLOW_PICK_MS = 10000;    // 10s+ pick = heavy deliberation
const MAX_HOOK_LEN = 60;       // skip long free-text "hooks"
const RELATIONSHIP_PICK_PREFIX = '{'; // JSON-encoded answer payload

/** Extract verbatim hook phrases worth echoing back in the reading.
 *  Filters out openers (identity data lives elsewhere), JSON-encoded
 *  relationship_pick payloads, very long free-text answers, and the
 *  literal 'pass' sentinel. Always includes the user's name. */
export function extractHooks(picks: PickEvent[]): string[] {
  const out = new Set<string>();
  for (const p of picks) {
    if (p.node_id === 'name' && typeof p.answer === 'string' && p.answer.trim()) {
      out.add(p.answer.trim());
      continue;
    }
    if (OPENER_NODE_IDS.has(p.node_id)) continue;
    const ans = p.answer;
    if (typeof ans === 'string') {
      const t = ans.trim();
      if (
        t.length > 0 &&
        t.length <= MAX_HOOK_LEN &&
        !t.startsWith(RELATIONSHIP_PICK_PREFIX) &&
        t !== 'pass'
      ) {
        out.add(t);
      }
    } else if (Array.isArray(ans)) {
      for (const v of ans) {
        if (typeof v === 'string' && v.length > 0 && v.length <= MAX_HOOK_LEN) {
          out.add(v.trim());
        }
      }
    }
  }
  return Array.from(out);
}

/** Extract side-channel signals from telemetry. Fast picks = loaded.
 *  Slow picks = deliberation. Empty intent = diagnostic non-answer.
 *  Initial != final = social filter applied. Returned as freeform
 *  paragraphs the observer + seer can read directly. */
export function extractSideChannel(
  timing: TimingEvent[],
  picks: PickEvent[],
): SideChannel {
  if (timing.length === 0 && picks.length === 0) return {};

  const pickByNode = new Map(picks.map((p) => [p.node_id, p]));
  const ansToString = (a: PickEvent['answer'] | undefined): string => {
    if (typeof a === 'string') return a;
    if (Array.isArray(a)) return a.join(', ');
    return '';
  };

  const signalParts: string[] = [];

  // Fast picks — pre-loaded, the option was already loaded before the user read it.
  const fast = timing.filter(
    (t) =>
      t.latency_ms > 0 &&
      t.latency_ms < FAST_PICK_MS &&
      !OPENER_NODE_IDS.has(t.node_id),
  );
  if (fast.length > 0) {
    const lines = fast.map((t) => {
      const ans = ansToString(pickByNode.get(t.node_id)?.answer);
      return `"${ans}" (${t.latency_ms}ms)`;
    });
    signalParts.push(`pre-loaded answers (fastest picks): ${lines.join(' · ')}`);
  }

  // Slow picks — heavy deliberation. Often the most diagnostic.
  const slow = timing.filter((t) => t.latency_ms > SLOW_PICK_MS);
  if (slow.length > 0) {
    const lines = slow.map((t) => {
      const ans = ansToString(pickByNode.get(t.node_id)?.answer);
      const secs = Math.round(t.latency_ms / 1000);
      return `"${ans}" (${secs}s)`;
    });
    signalParts.push(`heavy deliberation: ${lines.join(' · ')}`);
  }

  // Diagnostic non-answers. Empty intent opener is the canonical case.
  const intentPick = picks.find((p) => p.node_id === 'intent');
  if (
    intentPick &&
    (typeof intentPick.answer === 'string' ? intentPick.answer.trim() === '' : false)
  ) {
    signalParts.push('intent opener was left empty — user came without a stated question');
  }
  const passes = picks.filter(
    (p) =>
      !OPENER_NODE_IDS.has(p.node_id) &&
      ((typeof p.answer === 'string' && (p.answer.trim() === '' || p.answer === 'pass'))),
  );
  if (passes.length > 0) {
    const qs = passes.map((p) => `"${p.question_text}"`).join(' · ');
    signalParts.push(`passed/avoided: ${qs}`);
  }

  // Social filter — initial answer revised before submit.
  const deltas = timing.filter(
    (t) =>
      t.initial_pick != null &&
      typeof t.initial_pick === 'string' &&
      typeof t.final_pick === 'string' &&
      t.initial_pick !== t.final_pick,
  );
  if (deltas.length > 0) {
    const lines = deltas.map((t) => `${t.initial_pick} → ${t.final_pick}`);
    signalParts.push(`revised answers (social filter): ${lines.join(' · ')}`);
  }

  return signalParts.length > 0 ? { signals: signalParts.join(' \n ') } : {};
}
