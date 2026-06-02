// Build a markdown transcript from a closed engine state + compiler output.
// Mirrors the e2e harness log format so transcripts from UI runs can be
// shared back for iteration. Also persists per-run to localStorage and
// offers a downloadTranscript() helper for the browser-side save.

import type { EngineState, PickEvent } from '../../pipeline/antechamber';

const LS_KEY = 'tarobot:survey-logs';

/** Build a markdown transcript from the closed engine state. The
 *  brief/openers (formerly from Compiler) are no longer captured here
 *  — the Seer owns its prose_brief now and exposing it would couple
 *  this util to the Seer instance lifecycle. */
export function buildTranscriptMarkdown(
  state: EngineState,
  _unused: unknown = null,
): string {
  const name = state.profile.name || 'unnamed';
  const startedAt = new Date(state.started_at);
  const yyyy = startedAt.getUTCFullYear();
  const mm = String(startedAt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(startedAt.getUTCDate()).padStart(2, '0');
  const hh = String(startedAt.getUTCHours()).padStart(2, '0');
  const mi = String(startedAt.getUTCMinutes()).padStart(2, '0');

  const lines: string[] = [];
  lines.push(`# Tarobot survey run — ${name}`);
  lines.push(`## ${yyyy}-${mm}-${dd} ${hh}:${mi} UTC | tree v${state.tree_version} | source: live ui`);
  lines.push('');
  lines.push('## Transcript');
  lines.push('```');
  for (let i = 0; i < state.picks_log.length; i++) {
    const pick = state.picks_log[i]!;
    const timing = state.timing_log[i];
    const ansText = Array.isArray(pick.answer) ? pick.answer.join(', ') : pick.answer;
    lines.push('');
    lines.push(`Q${i + 1}. ${pick.question_text}`);
    lines.push(`A: ${ansText}   [${timing ? timing.latency_ms : '?'}ms]`);
  }
  lines.push('```');
  lines.push('');
  lines.push(`close reason: ${state.close_reason ?? 'unknown'}`);
  lines.push(`phase at close: ${state.phase}`);
  lines.push(`turn count: ${state.picks_log.length}`);
  lines.push('');

  // (prose_brief + openers used to be captured here from CompilerOutput;
  // they're owned by the Seer now and we don't thread them through.)

  lines.push('## Final engine state');
  lines.push('```json');
  lines.push(JSON.stringify(compressForLog(state), null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

function compressForLog(state: EngineState) {
  // Trim raw picks_log (already rendered in the transcript) and timing_log
  // (not useful in a brief log). Keep the analytical fields.
  return {
    session_id: state.session_id,
    tree_version: state.tree_version,
    profile: state.profile,
    doc: state.doc,
    is_returning_user: state.is_returning_user,
    phase: state.phase,
    closed: state.closed,
    close_reason: state.close_reason,
  };
}

// ─── persistence ────────────────────────────────────────────

type StoredLog = {
  session_id: string;
  saved_at: number;
  name: string;
  markdown: string;
};

export function persistLog(state: EngineState, _unused: unknown = null): void {
  const md = buildTranscriptMarkdown(state);
  const entry: StoredLog = {
    session_id: state.session_id,
    saved_at: Date.now(),
    name: state.profile.name || 'unnamed',
    markdown: md,
  };
  const existing = loadLogs();
  // Replace if this session already saved (e.g., compiler resolved after close)
  const next = existing.filter((l) => l.session_id !== entry.session_id).concat(entry);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    // quota — drop the oldest, retry once
    try {
      const trimmed = next.slice(-10);
      localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
    } catch {
      // give up
    }
  }
}

export function loadLogs(): StoredLog[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredLog[];
  } catch {
    return [];
  }
}

export function downloadTranscript(state: EngineState, _unused: unknown = null): void {
  const md = buildTranscriptMarkdown(state);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = (state.profile.name || 'unnamed').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ts = new Date(state.started_at);
  const yyyy = ts.getUTCFullYear();
  const mm = String(ts.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ts.getUTCDate()).padStart(2, '0');
  const hh = String(ts.getUTCHours()).padStart(2, '0');
  const mi = String(ts.getUTCMinutes()).padStart(2, '0');
  a.download = `tarobot-${name}-${yyyy}${mm}${dd}-${hh}${mi}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type { StoredLog, PickEvent };
