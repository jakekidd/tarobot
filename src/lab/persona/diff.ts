// Minimal line-level diff for the prompt editor's CHANGES view.
//
// Not git. There is no history — just the committed version vs the live
// working draft. Classic LCS over lines, emitted as a unified row list:
// unchanged lines for context, additions (+), deletions (−). Prompts are
// tens of lines, so the O(n·m) table is trivially cheap.

export type DiffRow = { type: 'same' | 'add' | 'del'; text: string };

export function lineDiff(oldText: string, newText: string): DiffRow[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = longest common subsequence length of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j]
        ? lcs[i + 1]![j + 1]! + 1
        : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i]! });
      i++; j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ type: 'del', text: a[i]! });
      i++;
    } else {
      rows.push({ type: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) { rows.push({ type: 'del', text: a[i]! }); i++; }
  while (j < m) { rows.push({ type: 'add', text: b[j]! }); j++; }
  return rows;
}
