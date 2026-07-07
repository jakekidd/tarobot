// Input-doc persistence for the xray lab — localStorage, lab-owned.
// The pipeline stays storage-blind: docs cross into the engine as plain
// data on EnsembleInput.

import { defaultDocs, type InputDoc } from '../../pipeline/ensemble';

const KEY = 'tarobot.xray.docs.v1';

export function loadDocs(): InputDoc[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const docs = defaultDocs();
      saveDocs(docs);
      return docs;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultDocs();
    return parsed as InputDoc[];
  } catch {
    return defaultDocs();
  }
}

export function saveDocs(docs: InputDoc[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(docs));
  } catch {
    /* storage full or unavailable — the lab keeps working in memory */
  }
}

export function newDoc(): InputDoc {
  return {
    id: `doc-${Date.now().toString(36)}`,
    name: 'untitled doc',
    md: '# intake — (name)\n\n',
    updatedAt: Date.now(),
  };
}
