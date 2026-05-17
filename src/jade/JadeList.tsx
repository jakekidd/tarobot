// The Jade editor — single-column list of every dialogue node, grouped
// by topic. Click a row to expand it inline; the expanded form is the
// full editor.
//
// Layout:
//   - top toolbar: search
//   - OPENERS section (the four intake questions in order)
//   - one section per topic (in topics[] order), each ending with a
//     "+ NEW QUESTION" button that creates a blank node in that topic
//
// Things that are not in the row anymore (by design):
//   - node id    — internal, designer doesn't need it on screen
//   - role/root  — implied by which section a row sits in
//   - dark       — concept retired; pass will be appended to every option
//                  in the future, so the flag is no longer meaningful
//
// Switching a node's format also reshapes its answer list:
//   - text/date  → no answers
//   - binary     → trim to first 2 (or pad)
//   - matrix     → exactly 4 (plus axes)
//   - choice/multi → keep current count

import { useCallback, useMemo, useState } from 'react';
import type {
  AnswerFormat,
  AnswerTuple,
  DialogueTree,
  TreeNode,
} from '../pipeline/survey';

const FORMATS: AnswerFormat[] = ['text', 'date', 'choice', 'binary', 'matrix'];

type Props = {
  tree: DialogueTree;
  setTree: (updater: (prev: DialogueTree) => DialogueTree) => void;
};

type Group = {
  /** Either an opener-marker or a topic id. */
  kind: 'openers' | 'topic';
  label: string;
  topicId?: string;
  nodeIds: string[];
};

export function JadeList({ tree, setTree }: Props) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo<Group[]>(() => buildGroups(tree, filter), [tree, filter]);
  const totalShown = useMemo(
    () => groups.reduce((n, g) => n + g.nodeIds.length, 0),
    [groups],
  );

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
      // If the format changed, reshape `a` to match.
      let nextNode = { ...node, ...patch };
      if (patch.f && patch.f !== node.f) {
        nextNode = reshapeForFormat(nextNode, patch.f);
      }
      return { ...prev, nodes: { ...prev.nodes, [id]: nextNode } };
    });
  }

  function addNewNode(topic: string, isOpener: boolean): void {
    const id = nextAutoId(tree, isOpener ? 'opener' : topic);
    const fresh: TreeNode = {
      topic,
      q: 'new question?',
      f: 'choice',
      a: [['option one'], ['option two']],
    };
    setTree((prev) => {
      const next: DialogueTree = {
        ...prev,
        nodes: { ...prev.nodes, [id]: fresh },
      };
      if (isOpener) next.openers = [...prev.openers, id];
      return next;
    });
    setExpanded((prev) => {
      const s = new Set(prev);
      s.add(id);
      return s;
    });
  }

  function deleteNode(id: string): void {
    if (!confirm(`delete this question? this cannot be undone (but RESET will pull the bundled defaults back).`)) return;
    setTree((prev) => {
      const nextNodes = { ...prev.nodes };
      delete nextNodes[id];
      return {
        ...prev,
        nodes: nextNodes,
        openers: prev.openers.filter((o) => o !== id),
      };
    });
  }

  return (
    <div className="jade-list">
      <div className="jade-list__toolbar">
        <input
          type="search"
          className="jade-list__search"
          placeholder="search by question text or answer…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="jade-list__count">
          {totalShown} of {Object.keys(tree.nodes).length} questions
        </span>
      </div>

      <div className="jade-list__rows">
        {groups.map((group) => (
          <section key={group.kind === 'openers' ? '__openers' : group.topicId!} className="jade-group">
            <header className={`jade-group__head jade-group__head--${group.kind === 'openers' ? 'openers' : 'topic'}`}>
              <span className="jade-group__name">{group.label}</span>
              <span className="jade-group__count">{group.nodeIds.length}</span>
            </header>

            {group.nodeIds.length === 0 && (
              <div className="jade-group__empty">
                <em>no questions in this topic yet.</em>
              </div>
            )}

            {group.nodeIds.map((id) => {
              const node = tree.nodes[id];
              if (!node) return null;
              const isOpen = expanded.has(id);
              return (
                <div
                  key={id}
                  className={`jade-row jade-row--${group.kind === 'openers' ? 'opener' : 'topic'} ${isOpen ? 'jade-row--open' : ''}`}
                >
                  <button type="button" className="jade-row__head" onClick={() => toggle(id)}>
                    <span className={`jade-row__fmt jade-row__fmt--${node.f}`}>{node.f}</span>
                    <span className="jade-row__q">{node.q || <em>(empty)</em>}</span>
                    <span className="jade-row__chev" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                  </button>

                  {isOpen && (
                    <div className="jade-row__body">
                      <NodeEditor
                        id={id}
                        node={node}
                        onPatch={(p) => patchNode(id, p)}
                        onDelete={() => deleteNode(id)}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="jade-group__add"
              onClick={() => addNewNode(group.topicId ?? 'intake', group.kind === 'openers')}
            >
              + NEW QUESTION
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── group builder ─────────────────────────────────────────

function buildGroups(tree: DialogueTree, filterRaw: string): Group[] {
  const filter = filterRaw.trim().toLowerCase();
  const matches = (id: string): boolean => {
    if (!filter) return true;
    const node = tree.nodes[id];
    if (!node) return false;
    if (node.q.toLowerCase().includes(filter)) return true;
    return (node.a ?? []).some((t) => (t[0] ?? '').toLowerCase().includes(filter));
  };

  const out: Group[] = [];

  // Openers — first, in stored order.
  const openersFiltered = tree.openers.filter((id) => tree.nodes[id] && matches(id));
  out.push({ kind: 'openers', label: 'openers', nodeIds: openersFiltered });

  // Topics — always show every topic, even empty (so the designer can add
  // there). Skip nodes that are in openers[] — they belong to the openers
  // section regardless of their `topic`.
  const openerSet = new Set(tree.openers);
  for (const topicId of tree.topics) {
    const ids = Object.keys(tree.nodes)
      .filter((id) => !openerSet.has(id))
      .filter((id) => tree.nodes[id]?.topic === topicId)
      .filter((id) => matches(id))
      .sort();
    out.push({ kind: 'topic', topicId, label: topicId, nodeIds: ids });
  }

  return out;
}

// ─── shaping answers when format changes ──────────────────

function reshapeForFormat(node: TreeNode, fmt: AnswerFormat): TreeNode {
  const current = node.a ?? [];
  const blank = (text = ''): AnswerTuple => [text];

  if (fmt === 'text' || fmt === 'date') {
    const out: TreeNode = { ...node, f: fmt };
    delete out.a;
    delete out.axes;
    return out;
  }
  if (fmt === 'binary') {
    const trimmed = current.slice(0, 2);
    while (trimmed.length < 2) trimmed.push(blank(trimmed.length === 0 ? 'yes' : 'no'));
    const out: TreeNode = { ...node, f: fmt, a: trimmed };
    delete out.axes;
    return out;
  }
  if (fmt === 'matrix') {
    const trimmed = current.slice(0, 4);
    while (trimmed.length < 4) trimmed.push(blank(`option ${trimmed.length + 1}`));
    return {
      ...node,
      f: fmt,
      a: trimmed,
      axes: node.axes ?? [['', ''], ['', '']],
    };
  }
  // choice or multi — keep existing answers (or seed two)
  const out: TreeNode = { ...node, f: fmt };
  if (out.a === undefined || out.a.length === 0) {
    out.a = [blank('option one'), blank('option two')];
  }
  delete out.axes;
  return out;
}

// ─── auto-id for new nodes ────────────────────────────────

function nextAutoId(tree: DialogueTree, prefix: string): string {
  const base = `new_${prefix.replace(/[^a-z0-9]/g, '_')}`;
  let i = 1;
  while (tree.nodes[`${base}_${i}`]) i++;
  return `${base}_${i}`;
}

// ─── per-node editor body ─────────────────────────────────

type NodeEditorProps = {
  id: string;
  node: TreeNode;
  onPatch: (patch: Partial<TreeNode>) => void;
  onDelete: () => void;
};

function NodeEditor({ id, node, onPatch, onDelete }: NodeEditorProps) {
  function patchAnswer(index: number, patch: Partial<{ text: string; comment: string }>): void {
    const current = node.a ?? [];
    const tuple = current[index] ?? ([''] as AnswerTuple);
    const text = patch.text !== undefined ? patch.text : tuple[0];
    const comment = patch.comment !== undefined ? patch.comment : (tuple[1] ?? '');
    const newTuple: AnswerTuple = comment ? [text, comment] : [text];
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

  const showAnswers = node.f === 'choice' || node.f === 'binary' || node.f === 'matrix';
  // Binary is fixed at 2 answers — can edit, not add/remove.
  const canAddRemove = node.f !== 'binary' && node.f !== 'matrix';

  return (
    <div className="jade-edit">
      <div className="jade-edit__grid">
        <label className="jade-edit__label">topic</label>
        <span className="jade-edit__topic">{node.topic}</span>

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
      </div>

      {showAnswers && (
        <div className="jade-edit__section">
          <div className="jade-edit__section-head">
            <span className="jade-edit__label">answers</span>
            {canAddRemove && (
              <button type="button" className="jade-edit__small" onClick={addAnswer}>+ add</button>
            )}
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
                {canAddRemove ? (
                  <button
                    type="button"
                    className="jade-edit__remove"
                    onClick={() => removeAnswer(i)}
                    aria-label="remove answer"
                  >×</button>
                ) : (
                  <span className="jade-edit__remove jade-edit__remove--locked" aria-hidden />
                )}
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
          delete question
        </button>
      </div>
    </div>
  );
}
