#!/usr/bin/env tsx
// Re-render xray.txt (the shareable transcript with offstage thinking
// indented) for every runs/live-*/session.json passed or found.
//   pnpm exec tsx --import ./scripts/register-raw-loader.mjs scripts/render-xray.ts [dirs...]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { buildXrayTranscript, type SessionRecord } from '../src/pipeline/ensemble/serialize';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dirs =
  args.length > 0
    ? args
    : readdirSync('runs')
        .filter((d) => d.startsWith('live-'))
        .map((d) => `runs/${d}`);
for (const dir of dirs) {
  try {
    if (!statSync(dir).isDirectory()) continue;
    const record = JSON.parse(readFileSync(`${dir}/session.json`, 'utf8')) as SessionRecord;
    writeFileSync(`${dir}/xray.txt`, buildXrayTranscript(record));
    console.log(`wrote ${dir}/xray.txt`);
  } catch (e) {
    console.log(`skip ${dir}: ${e instanceof Error ? e.message : e}`);
  }
}
