// The Jade editor — a single-column list of every dialogue node. Click
// a row to expand it inline; the expanded form is the full editor
// (question text, format, dark flag, default next, answers, axes when
// matrix). Toolbar across the top: search, "+ new node", scope toggles.
//
// Sort order:
//   1. openers (in their stored order — that order matters in the engine)
//   2. roots, alphabetical by id
//   3. followups, alphabetical by id
// Search filters everything across all three buckets.

import { useCallback, useMemo, useState } from 'react';
import type {
  AnswerFormat,
  AnswerTuple,
  DialogueTree,
  TreeNode,
} from '../pipeline/survey';

const FORMATS: AnswerFormat[] = ['text', 'date', 'choice', 'binary', 'multi', 'matrix'];

type Props = {
  tree: DialogueTree;
  setTree: (updater: (prev: DialogueTree) => DialogueTree) => void;
};

type Kind = 'opener' | 'root' | 'followup';

export function JadeList({ tree, setTree }: Props) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    return buildRows(tree, filter);
  }, [tree, filter]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function patchNode(id: string, patch: Partial<TreeNode>): void {
    setTree((prev) => {
      const node = prev.nodes[id];
      if (!node) return prev;
      return { ...prev, nodes: { ...prev.nodes, [id]: { ...node, ...patch } } };
    });
  }

  function addNewNode(): void {
    const id = promptForNewId(tree);
    if (!id) return;
    const fresh: TreeNode = { q: 'new question?', f: 'choice', a: [['answer one'], ['answer two']] };
    setTree((prev) => ({ ...prev, nodes: { ...prev.nodes, [id]: fresh } }));
    setExpanded((prev) => new Set(prev).add(id));
  }

  function deleteNode(id: string): void {
    if (!confirm(`delete node '${id}'? this cannot be undone (but you can RESET to bundled defaults).`)) return;
    setTree((prev) => {
      const nextNodes = { ...prev.nodes };
      delete nextNodes[id];
      // Strip from roots/openers + scrub `next`/answer-overrides pointing at it.
      const nextRoots = prev.roots.filter((r) => r !== id);
      const nextOpeners = prev.openers.filter((o) => o !== id);
      for (const [otherId, otherNode] of Object.entries(nextNodes)) {
        let changed = false;
        let node = otherNode;
        if (node.next === id) { node = { ...node, next: undefined }; changed = true; }
        if (node.a) {
          const newA = node.a.map((t): AnswerTuple => (t[2] === id ? (t[1] ? [t[0], t[1]] : [t[0]]) : t));
          if (newA.some((t, i) => t !== node.a![i])) {
            node = { ...node, a: newA };
            changed = true;
          }
        }
        if (changed) nextNodes[otherId] = node;
      }
      return { ...prev, nodes: nextNodes, roots: nextRoots, openers: nextOpeners };
    });
  }

  function toggleOpener(id: string, included: boolean): void {
    setTree((prev) => {
      const set = new Set(prev.openers);
      if (included) set.add(id); else set.delete(id);
      // Preserve stored ordering when removing; append when adding.
      const next = included
        ? Array.from(new Set([...prev.openers, id]))
        : prev.openers.filter((o) => o !== id);
      void set;
      return { ...prev, openers: next };
    });
  }

  function toggleRoot(id: string, included: boolean): void {
    setTree((prev) => {
      const next = included
        ? Array.from(new Set([...prev.roots, id]))
        : prev.roots.filter((r) => r !== id);
      return { ...prev, roots: next };
    });
  }

  return (
    <div className="jade-list">
      <div className="jade-list__toolbar">
        <input
          type="search"
          className="jade-list__search"
          placeholder="search by id or question…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button type="button" className="jade-list__add" onClick={addNewNode}>
          + NEW NODE
        </button>
        <span className="jade-list__count">
          {rows.length} of {Object.keys(tree.nodes).length} nodes
        </span>
      </div>

      <div className="jade-list__rows">
        {rows.length === 0 && (
          <div className="jade-list__empty"><em>no nodes match.</em></div>
        )}
        {rows.map(({ id, node, kind }) => {
          const isOpen = expanded.has(id);
          return (
            <div
              key={id}
              className={`jade-row jade-row--${kind} ${isOpen ? 'jade-row--open' : ''}`}
            >
              <button
                type="button"
                className="jade-row__head"
                onClick={() => toggle(id)}
              >
                <span className={`jade-row__kind jade-row__kind--${kind}`}>{kind}</span>
                <span className="jade-row__id">{id}</span>
                <span className={`jade-row__fmt jade-row__fmt--${node.f}`}>{node.f}</span>
                {node.is_dark && <span className="jade-row__dark">dark</span>}
                <span className="jade-row__q">{node.q || <em>(empty)</em>}</span>
                <span className="jade-row__chev" aria-hidden>{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="jade-row__body">
                  <NodeEditor
                    id={id}
                    node={node}
                    tree={tree}
                    onPatch={(patch) => patchNode(id, patch)}
                    onDelete={() => deleteNode(id)}
                    isOpener={tree.openers.includes(id)}
                    isRoot={tree.roots.includes(id)}
                    onToggleOpener={(v) => toggleOpener(id, v)}
                    onToggleRoot={(v) => toggleRoot(id, v)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Row builder ───────────────────────────────────────────

function buildRows(tree: DialogueTree, filterRaw: string): { id: string; node: TreeNode; kind: Kind }[] {
  const filter = filterRaw.trim().toLowerCase();
  const openersSet = new Set(tree.openers);
  const rootsSet = new Set(tree.roots);

  const kindOf = (id: string): Kind => {
    if (openersSet.has(id)) return 'opener';
    if (rootsSet.has(id)) return 'root';
    return 'followup';
  };

  const allIds = Object.keys(tree.nodes);

  // Sort: openers first (in stored order), then roots alpha, then followups alpha.
  const openerIds = tree.openers.filter((id) => tree.nodes[id]);
  const otherIds = allIds.filter((id) => !openersSet.has(id));
  const rootIds = otherIds.filter((id) => rootsSet.has(id)).sort();
  const followupIds = otherIds.filter((id) => !rootsSet.has(id)).sort();
  const sorted = [...openerIds, ...rootIds, ...followupIds];

  const rows: { id: string; node: TreeNode; kind: Kind }[] = [];
  for (const id of sorted) {
    const node = tree.nodes[id];
    if (!node) continue;
    if (filter) {
      const idMatch = id.toLowerCase().includes(filter);
      const qMatch = node.q.toLowerCase().includes(filter);
      const answerMatch = (node.a ?? []).some((t) => (t[0] ?? '').toLowerCase().includes(filter));
      if (!idMatch && !qMatch && !answerMatch) continue;
    }
    rows.push({ id, node, kind: kindOf(id) });
  }
  return rows;
}

function promptForNewId(tree: DialogueTree): string | null {
  const raw = prompt('node id (snake_case, lowercase letters/numbers/underscores):');
  if (!raw) return null;
  const id = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    alert('invalid id. use snake_case starting with a letter.');
    return null;
  }
  if (tree.nodes[id]) {
    alert(`'${id}' already exists.`);
    return null;
  }
  return id;
}

// ─── Per-node editor body (inline in the expanded row) ────

type NodeEditorProps = {
  id: string;
  node: TreeNode;
  tree: DialogueTree;
  onPatch: (patch: Partial<TreeNode>) => void;
  onDelete: () => void;
  isOpener: boolean;
  isRoot: boolean;
  onToggleOpener: (v: boolean) => void;
  onToggleRoot: (v: boolean) => void;
};

function NodeEditor({
  id, node, tree, onPatch, onDelete,
  isOpener, isRoot, onToggleOpener, onToggleRoot,
}: NodeEditorProps) {
  const allNodeIds = useMemo(() => Object.keys(tree.nodes).sort(), [tree]);

  function patchAnswer(index: number, patch: Partial<{ text: string; comment: string; next: string }>): void {
    const current = node.a ?? [];
    const tuple = current[index] ?? ([''] as AnswerTuple);
    const text = patch.text !== undefined ? patch.text : tuple[0];
    const comment = patch.comment !== undefined ? patch.comment : (tuple[1] ?? '');
    const next = patch.next !== undefined ? patch.next : (tuple[2] ?? '');
    const newTuple: AnswerTuple = next
      ? [text, comment, next]
      : comment
        ? [text, comment]
        : [text];
    const newA = [...current];
    newA[index] = newTuple;
    onPatch({ a: newA });
  }
  function addAnswer(): void {
    onPatch({ a: [...(node.a ?? []), [''] as AnswerTuple] });
  }
  function removeAnswer(index: number): void {
    onPatch({ a: (node.a ?? []).filter((_, i) => i !== index) });
  }
  function setAxisCell(axis: 0 | 1, end: 0 | 1, val: string): void {
    const axes = node.axes ?? [['', ''], ['', '']];
    const newAxes: [[string, string], [string, string]] = [
      [...axes[0]] as [string, string],
      [...axes[1]] as [string, string],
    ];
    newAxes[axis][end] = val;
    onPatch({ axes: newAxes });
  }

  const showAnswers = node.f === 'choice' || node.f === 'binary' || node.f === 'multi' || node.f === 'matrix';

  return (
    <div className="jade-edit">
      <div className="jade-edit__grid">
        <label className="jade-edit__label">question</label>
        <textarea
          className="jade-edit__textarea"
          value={node.q}
          rows={2}
          onChange={(e) => onPatch({ q: e.target.value })}
        />

        <label className="jade-edit__label">format</label>
        <select
          className="jade-edit__select"
          value={node.f}
          onChange={(e) => onPatch({ f: e.target.value as AnswerFormat })}
        >
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        <label className="jade-edit__label">role</label>
        <div className="jade-edit__roles">
          <label className="jade-edit__check">
            <input type="checkbox" checked={isOpener} onChange={(e) => onToggleOpener(e.target.checked)} />
            <span>opener</span>
          </label>
          <label className="jade-edit__check">
            <input type="checkbox" checked={isRoot} onChange={(e) => onToggleRoot(e.target.checked)} />
            <span>root (investigator-pickable)</span>
          </label>
          <label className="jade-edit__check">
            <input type="checkbox" checked={node.is_dark ?? false} onChange={(e) => onPatch({ is_dark: e.target.checked || undefined })} />
            <span>dark (append "pass")</span>
          </label>
        </div>

        <label className="jade-edit__label">default next</label>
        <select
          className="jade-edit__select"
          value={node.next ?? ''}
          onChange={(e) => onPatch({ next: e.target.value || undefined })}
        >
          <option value="">— none (return to root pool)</option>
          {allNodeIds.map((nid) => <option key={nid} value={nid}>{nid}</option>)}
        </select>
      </div>

      {showAnswers && (
        <div className="jade-edit__section">
          <div className="jade-edit__section-head">
            <span className="jade-edit__label">answers</span>
            <button type="button" className="jade-edit__small" onClick={addAnswer}>+ add</button>
          </div>
          <div className="jade-edit__answers">
            {(node.a ?? []).map((tuple, i) => (
              <div key={i} className="jade-edit__answer">
                <input
                  type="text"
                  className="jade-edit__answer-text"
                  placeholder="answer text"
                  value={tuple[0] ?? ''}
                  onChange={(e) => patchAnswer(i, { text: e.target.value })}
                />
                <input
                  type="text"
                  className="jade-edit__answer-comment"
                  placeholder="comment (optional)"
                  value={tuple[1] ?? ''}
                  onChange={(e) => patchAnswer(i, { comment: e.target.value })}
                />
                <select
                  className="jade-edit__answer-next"
                  value={tuple[2] ?? ''}
                  onChange={(e) => patchAnswer(i, { next: e.target.value })}
                  title="answer-specific next override"
                >
                  <option value="">— use default</option>
                  {allNodeIds.map((nid) => <option key={nid} value={nid}>→ {nid}</option>)}
                </select>
                <button
                  type="button"
                  className="jade-edit__remove"
                  onClick={() => removeAnswer(i)}
                  aria-label="remove answer"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {node.f === 'matrix' && (
        <div className="jade-edit__section">
          <span className="jade-edit__label">matrix axes</span>
          <div className="jade-edit__axes">
            <input className="jade-edit__axis" type="text" placeholder="x low" value={node.axes?.[0][0] ?? ''} onChange={(e) => setAxisCell(0, 0, e.target.value)} />
            <input className="jade-edit__axis" type="text" placeholder="x high" value={node.axes?.[0][1] ?? ''} onChange={(e) => setAxisCell(0, 1, e.target.value)} />
            <input className="jade-edit__axis" type="text" placeholder="y low" value={node.axes?.[1][0] ?? ''} onChange={(e) => setAxisCell(1, 0, e.target.value)} />
            <input className="jade-edit__axis" type="text" placeholder="y high" value={node.axes?.[1][1] ?? ''} onChange={(e) => setAxisCell(1, 1, e.target.value)} />
          </div>
        </div>
      )}

      <div className="jade-edit__danger">
        <span className="jade-edit__id-readout">id: <code>{id}</code></span>
        <button type="button" className="jade-edit__delete" onClick={onDelete}>
          delete node
        </button>
      </div>
    </div>
  );
}
