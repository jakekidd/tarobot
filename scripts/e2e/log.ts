// Colorful console logger + run-log writer for the e2e survey bot harness.
// Writes a timestamped markdown transcript to runs/YYYY-MM-DD/<name>-HHMM.md
// alongside streaming colored output to the terminal.

import kleur from 'kleur';
import * as fs from 'node:fs';
import * as path from 'node:path';

type LogLines = string[];

export type RunLogger = {
  archetypeGenerated: (name: string, summary: string) => void;
  phaseHeader: (phase: string, heat: number) => void;
  question: (idx: number, text: string, options: string[], preamble?: string) => void;
  answer: (text: string | string[], latencyMs: number) => void;
  observerUpdate: (notesCount: number, choiceConfidence: string | null, heat: number) => void;
  investigatorPick: (nodeId: string, reasoning: string) => void;
  close: (reason: string) => void;
  compilerSection: (header: string, body: string) => void;
  error: (where: string, err: unknown) => void;
  writeRunLog: (archetype: unknown, finalState: unknown, brief: unknown) => string;
};

export function createLogger(runsDir: string, archetypeName: string): RunLogger {
  const lines: LogLines = [];
  const startedAt = new Date();

  const log = (line: string, plain: string) => {
    console.log(line);
    lines.push(plain);
  };

  return {
    archetypeGenerated(name, summary) {
      log(kleur.cyan().dim(`\n[archetype] generated ${name}`), `[archetype] generated ${name}`);
      log(kleur.cyan().dim(`            ${summary}`), `            ${summary}`);
    },
    phaseHeader(phase, heat) {
      log(
        kleur.yellow().bold(`\n→ phase ${phase}   heat ${heat.toFixed(2)}`),
        `\n→ phase ${phase}   heat ${heat.toFixed(2)}`,
      );
    },
    question(idx, text, options, preamble) {
      log('', '');
      if (preamble) {
        log(kleur.magenta().italic(`   ${preamble}`), `   ${preamble}`);
      }
      log(kleur.bold().white(`Q${idx}. ${text}`), `Q${idx}. ${text}`);
      for (const o of options) {
        log(kleur.gray(`    · ${o}`), `    · ${o}`);
      }
    },
    answer(text, latencyMs) {
      const tDisplay = Array.isArray(text) ? text.join(', ') : text;
      log(
        kleur.green(`A: ${tDisplay}`) + kleur.gray().dim(`   [${latencyMs}ms]`),
        `A: ${tDisplay}   [${latencyMs}ms]`,
      );
    },
    observerUpdate(notesCount, choiceConfidence, heat) {
      const conf = choiceConfidence ?? '—';
      log(
        kleur.magenta().dim(`   ↳ observer: ${notesCount} notes, choice=${conf}, heat=${heat.toFixed(2)}`),
        `   ↳ observer: ${notesCount} notes, choice=${conf}, heat=${heat.toFixed(2)}`,
      );
    },
    investigatorPick(nodeId, reasoning) {
      log(
        kleur.yellow().dim(`   ↳ investigator → ${nodeId}: ${reasoning}`),
        `   ↳ investigator → ${nodeId}: ${reasoning}`,
      );
    },
    close(reason) {
      log(kleur.cyan().bold(`\n● survey closed — ${reason}`), `\n● survey closed — ${reason}`);
    },
    compilerSection(header, body) {
      log(kleur.cyan().bold(`\n${header}`), `\n${header}`);
      log(kleur.white(body), body);
    },
    error(where, err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(kleur.red().bold(`\n[error in ${where}] ${msg}`), `[error in ${where}] ${msg}`);
    },
    writeRunLog(archetype, finalState, brief) {
      const yyyy = startedAt.getUTCFullYear();
      const mm = String(startedAt.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(startedAt.getUTCDate()).padStart(2, '0');
      const hh = String(startedAt.getUTCHours()).padStart(2, '0');
      const mi = String(startedAt.getUTCMinutes()).padStart(2, '0');
      const dir = path.join(runsDir, `${yyyy}-${mm}-${dd}`);
      fs.mkdirSync(dir, { recursive: true });
      const filename = path.join(dir, `${archetypeName}-${hh}${mi}.md`);

      const content = [
        `# Tarobot survey run — ${archetypeName}`,
        `## ${yyyy}-${mm}-${dd} ${hh}:${mi} UTC | tree v0.4.0`,
        '',
        '## Run log',
        '```',
        ...lines,
        '```',
        '',
        '## Final compiler output (brief)',
        '```json',
        JSON.stringify(brief, null, 2),
        '```',
        '',
        '## Final engine state',
        '```json',
        JSON.stringify(finalState, null, 2),
        '```',
        '',
        '## Archetype reference',
        '```json',
        JSON.stringify(archetype, null, 2),
        '```',
        '',
      ].join('\n');

      fs.writeFileSync(filename, content, 'utf8');
      return filename;
    },
  };
}
