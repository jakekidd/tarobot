// Click-a-response-to-chat: a sample opened into a multi-turn thread.
//
// Seeded with the seeker's quote and (if run) the seer's reply. Jade adds
// turns two ways: "be the seeker" (she types the next seeker line) or
// "direct" (she tells clat what the seeker should do; a helper writes the
// line). The seer replies each turn using the LIVE working prompt, so the
// thread reflects uncommitted edits. It's one transcript array — that's
// the whole trick.

import { useRef, useState } from 'react';
import type { LLMAdapter } from '../../pipeline/llm/adapter';
import type { Sample } from './samples';
import type { PersonaModel } from './storage';
import { type Turn, runThreadReply, generateSeekerLine } from './runner';

type Mode = 'seeker' | 'direct';

type Props = {
  sample: Sample;
  seed: { seeker: string; seer?: string };
  adapter: LLMAdapter;
  persona: string;
  model: PersonaModel;
  onClose: () => void;
};

export function ThreadPanel({ sample, seed, adapter, persona, model, onClose }: Props) {
  const [turns, setTurns] = useState<Turn[]>(() => {
    const t: Turn[] = [{ role: 'seeker', text: seed.seeker }];
    if (seed.seer) t.push({ role: 'seer', text: seed.seer });
    return t;
  });
  const [mode, setMode] = useState<Mode>('seeker');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollDown() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function seerReplyTo(history: Turn[]) {
    setTurns([...history, { role: 'seer', text: '' }]);
    scrollDown();
    await runThreadReply(adapter, persona, history, model, (chunk) => {
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'seer') next[next.length - 1] = { role: 'seer', text: last.text + chunk };
        return next;
      });
      scrollDown();
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput('');
    try {
      const seekerLine = mode === 'direct'
        ? (await generateSeekerLine(adapter, turns, text, model)).trim()
        : text;
      const withSeeker: Turn[] = [...turns, { role: 'seeker', text: seekerLine }];
      setTurns(withSeeker);
      scrollDown();
      await seerReplyTo(withSeeker);
    } catch (e) {
      const msg = `[error: ${e instanceof Error ? e.message : 'failed'}]`;
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        // Replace a trailing empty seer bubble (failed mid-stream) instead
        // of stacking a second one.
        if (last && last.role === 'seer' && last.text === '') next[next.length - 1] = { role: 'seer', text: msg };
        else next.push({ role: 'seer', text: msg });
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pst-thread" role="dialog" aria-label="sample thread">
      <div className="pst-thread__head">
        <span className="pst-card__tag">{sample.tag} · thread</span>
        <button type="button" className="pst-link" onClick={onClose}>close ×</button>
      </div>

      <div className="pst-thread__log" ref={scrollRef}>
        {turns.map((t, i) => (
          <div key={i} className={`pst-turn pst-turn--${t.role}`}>
            <span className="pst-turn__who">{t.role}</span>
            <div className="pst-turn__text">{t.text || (busy && i === turns.length - 1 ? '…' : '')}</div>
          </div>
        ))}
      </div>

      <div className="pst-thread__compose">
        <div className="pst-seg pst-seg--sm">
          {(['seeker', 'direct'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`pst-seg__btn ${mode === m ? 'pst-seg__btn--on' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'seeker' ? 'be the seeker' : 'direct'}
            </button>
          ))}
        </div>
        <textarea
          className="pst-thread__input"
          value={input}
          spellCheck={false}
          placeholder={mode === 'seeker'
            ? "what the seeker says next…"
            : "direct the seeker (\"get defensive and bring up money\")…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
        />
        <button type="button" className="pst-runall" onClick={() => void send()} disabled={busy || !input.trim()}>
          {busy ? '…' : 'send'}
        </button>
      </div>
    </div>
  );
}
