#!/usr/bin/env tsx
// The mechanical transcript checks — SESSION-V2 §9. Scriptable, no LLM.
// These are the stage gates: reads a session.json (SessionRecord) and
// reports pass/fail per check. Exit 1 on any failure.
//
//   pnpm check -- runs/live-<stamp>/session.json [--checks=1,4,5,9]

import { readFileSync } from 'node:fs';
import type { SessionRecord } from '../src/pipeline/ensemble/serialize';
import type { Beat, Ev, Intent, ScrollEntry } from '../src/pipeline/ensemble/types';

type Result = { id: number; name: string; pass: boolean; detail: string };

function words(t: string): number {
  const s = t.trim();
  return s ? s.split(/\s+/).length : 0;
}

export function checkSession(record: SessionRecord, only?: number[]): Result[] {
  const scroll = record.snapshot.scroll as ScrollEntry[];
  const beats = scroll.filter((e): e is Beat => e.kind === 'beat');
  const oracle = beats.filter((b) => b.speaker === 'oracle');
  const evs = scroll.filter((e): e is Ev => e.kind === 'ev');
  const dealIdx = scroll.findIndex((e) => e.kind === 'ev' && e.ev === 'deal');
  const firstVisitorIdx = scroll.findIndex(
    (e) => e.kind === 'beat' && e.speaker === 'visitor',
  );
  const intro = (i: number) => (dealIdx === -1 ? true : i < dealIdx);
  const escaped =
    oracle.some((b) => b.beatType === 'rant_bid' && b.text.includes('the hard way')) ||
    // the demand path: the visitor asked for the cards during intro
    scroll.some(
      (e, i) =>
        e.kind === 'beat' &&
        e.speaker === 'visitor' &&
        intro(i) &&
        /\b(cards?|do the cards|show me the cards)\b/i.test(e.text) &&
        /\b(do|show|deal|give|see|please)\b/i.test(e.text),
    );
  const intents = record.snapshot.piles.intents.map((i) => i.payload as Intent);

  const results: Result[] = [];
  const add = (id: number, name: string, pass: boolean, detail: string) => {
    if (!only || only.includes(id)) results.push({ id, name, pass, detail });
  };

  // 1 — oracle beats before the first visitor turn <= 2
  const preVisitor = scroll
    .slice(0, firstVisitorIdx === -1 ? scroll.length : firstVisitorIdx)
    .filter((e) => e.kind === 'beat' && e.speaker === 'oracle').length;
  add(1, 'opening ≤ 2 oracle beats', preVisitor <= 2, `${preVisitor} before first visitor turn`);

  // 2 — rant bid present; visitor intro words >= 2x oracle intro words
  const rantBid = oracle.some((b) => b.beatType === 'rant_bid');
  let oIntroW = 0;
  let vIntroW = 0;
  scroll.forEach((e, i) => {
    if (e.kind === 'beat' && intro(i)) {
      if (e.speaker === 'oracle') oIntroW += words(e.text);
      else vIntroW += words(e.text);
    }
  });
  add(
    2,
    'rant bid + visitor-led intro',
    rantBid && (firstVisitorIdx === -1 || vIntroW >= 2 * oIntroW),
    `rant_bid=${rantBid}, intro words visitor ${vIntroW} vs oracle ${oIntroW}`,
  );

  // 3 — intro template questions >= 2 (unless escape)
  const introQuestions = scroll.filter(
    (e, i) => e.kind === 'beat' && e.speaker === 'oracle' && e.beatType === 'question' && intro(i),
  ).length;
  add(
    3,
    'intro questions ≥ 2 (or escape)',
    escaped || introQuestions >= 2,
    `${introQuestions} intro questions${escaped ? ' (escape path)' : ''}`,
  );

  // 4 — every QUOTE fill is a substring of prior visitor turns
  let quoteFails = 0;
  let quoteTotal = 0;
  let visitorSoFar = '';
  for (const e of scroll) {
    if (e.kind === 'beat' && e.speaker === 'visitor') visitorSoFar += `\n${e.text.toLowerCase()}`;
    if (e.kind === 'beat' && e.speaker === 'oracle' && e.fills) {
      for (const f of e.fills) {
        if (!f.key.startsWith('QUOTE')) continue;
        quoteTotal += 1;
        if (!visitorSoFar.includes(f.text.toLowerCase())) quoteFails += 1;
      }
    }
  }
  add(4, 'QUOTE slots verified', quoteFails === 0, `${quoteTotal} quotes, ${quoteFails} unverified`);

  // 5 — no two consecutive oracle beats of the same type (tissue exempt)
  let law3 = true;
  let law3Detail = 'clean';
  for (let i = 1; i < oracle.length; i++) {
    const a = oracle[i - 1].beatType;
    const b = oracle[i].beatType;
    if (a && b && a === b && a !== 'tissue') {
      law3 = false;
      law3Detail = `consecutive ${a}`;
      break;
    }
  }
  add(5, 'no consecutive same-type beats', law3, law3Detail);

  // 6 — the deal occurs after >= 1 substantive visitor turn (unless escape)
  const substantiveBefore = scroll.some(
    (e, i) => e.kind === 'beat' && e.speaker === 'visitor' && words(e.text) >= 5 && (dealIdx === -1 || i < dealIdx),
  );
  add(
    6,
    'deal after substantive turn (or escape)',
    dealIdx === -1 || escaped || substantiveBefore,
    dealIdx === -1 ? 'no deal' : escaped ? 'escape path' : `substantive=${substantiveBefore}`,
  );

  // 7 — naming fired IFF (dilemma committed AND coherence >= gate)
  const named = oracle.some((b) => b.beatType === 'naming');
  const committed = Boolean(record.snapshot.dilemma.problem_md && record.snapshot.dilemma.options_md);
  const gate = record.snapshot.constants.COHERENCE_GATE;
  const cohOk = record.snapshot.coherence >= gate;
  const shouldName = committed && cohOk;
  add(
    7,
    'naming IFF committed ∧ coherent',
    named === shouldName || (shouldName && !named && record.snapshot.flipped.length < 2),
    `named=${named}, committed=${committed}, coherence=${record.snapshot.coherence}/${gate}`,
  );

  // 8 — every read intent carries a position tag
  const readIntents = intents.filter((i) => i.beat === 'read');
  const untagged = readIntents.filter((i) => !i.position).length;
  add(8, 'reads carry position tags', untagged === 0, `${readIntents.length} reads, ${untagged} untagged`);

  // 9 — quest <= 2 sentences; the close is V (last oracle beat is close type)
  const questBeat = oracle.find((b) => b.beatType === 'quest');
  const questSentences = questBeat
    ? (questBeat.text.replace(/^one more thing before you go\.\s*/, '').match(/[.!?]+/g) ?? []).length
    : 0;
  const lastOracle = oracle[oracle.length - 1];
  const closeIsV = !lastOracle || lastOracle.beatType === 'close';
  add(
    9,
    'quest ≤ 2 sentences; close is V',
    (questBeat === undefined || questSentences <= 2) && closeIsV,
    `quest sentences=${questBeat ? questSentences : 'n/a'}, last beat=${lastOracle?.beatType}`,
  );

  // 11 — FORESIGHT-LEAK: no oracle beat names an unflipped card's face
  let foresight = 0;
  const flipAt = new Map<number, number>();
  scroll.forEach((e, i) => {
    if (e.kind === 'ev' && e.ev === 'flip' && e.slot !== undefined) flipAt.set(e.slot, i);
  });
  for (const d of record.snapshot.drawn ?? []) {
    const nameWords = d.card.name.toLowerCase().split(' ').filter((w) => w.length >= 4);
    const full = d.card.name.toLowerCase();
    const flipIdx = flipAt.get(d.slot) ?? Number.MAX_SAFE_INTEGER;
    scroll.forEach((e, i) => {
      if (i >= flipIdx || e.kind !== 'beat' || e.speaker !== 'oracle') return;
      const t = e.text.toLowerCase();
      const hits = nameWords.filter((w) => t.includes(w)).length;
      if (t.includes(full) || hits >= 2) foresight += 1;
    });
  }
  add(11, 'no unflipped face spoken (augur stays backstage)', foresight === 0, `${foresight} leak(s)`);

  // 10 — the arc completed: deal + >=1 flip + close
  const complete =
    record.input.mode === 'chat' ||
    (dealIdx !== -1 && evs.some((e) => e.ev === 'flip') && evs.some((e) => e.ev === 'close'));
  add(10, 'arc completed (deal+flip+close)', complete, `deal=${dealIdx !== -1}, flips=${record.snapshot.flipped.length}, closed=${record.snapshot.phase === 'closed'}`);

  return results;
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error('usage: pnpm check -- <session.json> [--checks=1,4,5,9]');
    process.exit(1);
  }
  const onlyArg = args.find((a) => a.startsWith('--checks='));
  const only = onlyArg ? onlyArg.slice('--checks='.length).split(',').map(Number) : undefined;
  const record = JSON.parse(readFileSync(path, 'utf8')) as SessionRecord;
  const results = checkSession(record, only);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${String(r.id).padStart(2)}  ${r.name} — ${r.detail}`);
    if (!r.pass) failed += 1;
  }
  console.log(failed === 0 ? '\nall checks passed.' : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

const invokedDirectly = process.argv[1]?.endsWith('check-session.ts');
if (invokedDirectly) main();
