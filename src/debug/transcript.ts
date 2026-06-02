// Shared markdown transcript builder. Used by AgentActivity (COPY
// button) and SeerError (DOWNLOAD button). Pairs each Q&A pick with
// the agent events that fired between it and the next pick.

import { getAgentEvents, type AgentEvent } from './agentActivityBus';
import { getAntechamberState } from './antechamberStateBus';
import type { PickEvent } from '../pipeline/antechamber';

export function buildTranscript(events?: readonly AgentEvent[]): string {
  const evs = events ?? getAgentEvents();
  const state = getAntechamberState();
  const out: string[] = [];
  const now = new Date();
  out.push('# Tarobot pipeline transcript');
  out.push(`## ${now.toISOString()}`);
  if (state?.profile?.name) out.push(`## subject: ${state.profile.name}`);
  if (state?.session_id) out.push(`## session: ${state.session_id}`);
  if (state?.chosen_intention) out.push(`## intention: ${state.chosen_intention}`);
  out.push('');

  const picks: readonly PickEvent[] = state?.picks_log ?? [];
  const windows: Array<{ start: number; end: number; pick: PickEvent | null; label: string }> = [];
  let prev = 0;
  picks.forEach((p, i) => {
    windows.push({
      start: prev,
      end: p.answered_at,
      pick: p,
      label: `Q${i + 1}`,
    });
    prev = p.answered_at;
  });
  windows.push({
    start: prev,
    end: Number.POSITIVE_INFINITY,
    pick: null,
    label: 'end-of-antechamber compile + reading',
  });

  for (const w of windows) {
    if (w.pick) {
      const p = w.pick;
      const answerText = typeof p.answer === 'string' ? p.answer : JSON.stringify(p.answer);
      out.push(`## ${w.label} · ${p.node_id}`);
      out.push(`Q: ${p.question_text}`);
      if (p.options_shown && p.options_shown.length > 0) {
        out.push(`Options: ${p.options_shown.join(' / ')}`);
      }
      out.push(`A: ${answerText}   [${p.latency_ms}ms]`);
    } else {
      out.push(`## ${w.label}`);
    }
    const matched = evs.filter((e) => e.started_at >= w.start && e.started_at < w.end);
    if (matched.length === 0) {
      out.push('(no agent activity in this window)');
    } else {
      for (const e of matched) {
        const dur = e.ended_at
          ? `${((e.ended_at - e.started_at) / 1000).toFixed(1)}s`
          : 'in flight';
        const status =
          e.status === 'failed' ? ' FAILED' : e.status === 'started' ? ' (live)' : '';
        out.push('');
        out.push(`### ${e.label}${status} · ${e.model ?? '?'} · ${dur}`);
        if (e.error) out.push(`error: ${e.error}`);
        if (e.response_preview) {
          out.push('```');
          out.push(e.response_preview);
          out.push('```');
        }
      }
    }
    out.push('');
  }
  return out.join('\n');
}

export function copyTranscriptToClipboard(): void {
  const text = buildTranscript();
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      console.warn('[transcript] clipboard write failed; transcript:');
      console.log(text);
    });
  } else {
    console.warn('[transcript] no clipboard API; transcript:');
    console.log(text);
  }
}

/** Trigger a .md download of the transcript via a temporary blob URL. */
export function downloadTranscript(): void {
  const text = buildTranscript();
  const state = getAntechamberState();
  const subject = state?.profile?.name?.toLowerCase()?.replace(/[^a-z0-9]+/g, '-') || 'session';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `tarobot-${subject}-${stamp}.md`;

  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a tick to start the download, then release the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
