// Smoke test for the IntroductionSurvey. Walks the real materials/survey.json
// in plain Node — no Vite, no browser — and prints the RawPortrait, exercising
// the weight-sort (hot conclusions first) and the weight-gated shadows
// (declined options only surface as negative space when they ran >= 2).
//
//   npx tsx scripts/survey-smoke.ts
//
// This is the iteration surface: run it, read what the survey produces, tune
// the channels/weights in survey.json, re-run.

import { readFileSync } from 'node:fs';
import { SurveyDocSchema } from '../src/pipeline/introduction-survey/schema';
import { IntroductionSurvey } from '../src/pipeline/introduction-survey/survey';
import type { RawPortrait } from '../src/pipeline/introduction-survey/types';

const doc = SurveyDocSchema.parse(JSON.parse(readFileSync('materials/survey.json', 'utf8')));
const survey = new IntroductionSurvey(doc);

// Walk: name → one answer per facet (alternating hottest / coldest so the
// amalgam shows a clear high→low spread) → birthdate → done.
let facetSeen = 0;
for (;;) {
  const step = survey.current();
  if (step.kind === 'name') {
    survey.submit({ kind: 'name', name: 'Jake', color: '#9d6cff' });
  } else if (step.kind === 'choice') {
    const facet = doc.facets.find((f) => f.slug === step.slug)!;
    const wantHot = facetSeen % 2 === 0;
    const ranked = [...facet.options].sort((a, b) => (wantHot ? b.weight - a.weight : a.weight - b.weight));
    survey.submit({ kind: 'choice', value: ranked[0]!.label });
    facetSeen += 1;
  } else if (step.kind === 'birthdate') {
    survey.submit({ kind: 'birthdate', iso: '1990-07-15' });
  } else {
    break;
  }
}

const raw = survey.result();
if (!raw) {
  console.error('✗ survey did not finish');
  process.exit(1);
}

printPortrait(raw);

function printPortrait(p: RawPortrait): void {
  console.log('\n=== IDENTITY ===');
  console.log(`  ${p.identity.name} (${p.identity.name_color}) · ${p.identity.sun_sign} · life path ${p.identity.life_path} · ${p.identity.birth_card?.name} · ${p.identity.age_bracket}`);
  console.log(`  relationship: ${p.identity.relationship_status}`);

  console.log('\n=== PICKS (collection order, with weight) ===');
  for (const f of p.facets) {
    console.log(`  [w${f.weight}] ${f.slug.padEnd(20)} "${f.chosen}"   (+${f.shadows.length} shadows)`);
  }

  console.log('\n=== AMALGAM · indicators (weight-sorted, hot first) ===');
  p.amalgam.indicators.forEach((s) => console.log('  •', s));

  console.log('\n=== AMALGAM · identities ===');
  p.amalgam.identities.forEach((s) => console.log('  •', s));

  console.log('\n=== AMALGAM · shadows (negative space; weight>=2 omissions only) ===');
  p.amalgam.shadows.forEach((s) => console.log('  ◦', s));

  // ── assertions ──
  console.log('\n=== CHECKS ===');
  const byWeightDesc = [...p.facets].sort((a, b) => b.weight - a.weight);
  const expectFirst = byWeightDesc[0]!.channels.indicators[0];
  check(p.amalgam.indicators[0] === expectFirst, `amalgam leads with the hottest indicator ("${expectFirst}")`);

  const perFacetShadows = p.facets.reduce((n, f) => n + f.shadows.length, 0);
  check(p.amalgam.shadows.length === perFacetShadows, `amalgam shadow count (${p.amalgam.shadows.length}) == sum of per-facet shadows`);

  const everyDeclinedHasShadow = p.facets.every((f) => f.shadows.length === f.declined.length);
  check(everyDeclinedHasShadow, 'every declined option contributed a shadow (nothing gated)');

  console.log(`\n✓ smoke passed — ${p.facets.length} facets · ${p.amalgam.indicators.length} indicators · ${p.amalgam.shadows.length} shadows`);
}

function check(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('  ✗ FAILED:', msg);
    process.exit(1);
  }
  console.log('  ✓', msg);
}
