// Side panel for editing the currently-selected node. All controls write
// straight back into the tree; Jade.tsx auto-saves on every mutation.

import { useMemo } from 'react';
import type {
  AnswerFormat,
  AnswerTuple,
  DialogueTree,
  TreeNode,
} from '../pipeline/survey';

type Props = {
  tree: DialogueTree;
  selectedId: string | null;
  onUpdate: (id: string, patch: Partial<TreeNode>) => void;
};

const FORMATS: AnswerFormat[] = ['text', 'date', 'choice', 'binary', 'multi', 'matrix'];

export function JadeEditor({ tree, selectedId, onUpdate }: Props) {
  const node = selectedId ? tree.nodes[selectedId] : null;
  const allNodeIds = useMemo(() => Object.keys(tree.nodes).sort(), [tree]);

  if (!selectedId || !node) {
    return (
      <aside className="jade-editor jade-editor--empty">
        <div className="jade-editor__hint">
          <p>click a node on the canvas to edit it.</p>
          <p className="jade-editor__legend">
            <span className="jade-editor__legend-row">
              <span className="jade-editor__legend-swatch" style={{ background: '#1f1538', borderColor: '#b388ff' }} /> opener
            </span>
            <span className="jade-editor__legend-row">
              <span className="jade-editor__legend-swatch" style={{ background: '#15102a', borderColor: '#7c3aed' }} /> root
            </span>
            <span className="jade-editor__legend-row">
              <span className="jade-editor__legend-swatch" style={{ background: '#0b0820', borderColor: '#564a78' }} /> followup
            </span>
          </p>
          <p className="jade-editor__hint-tip">
            drag to pan · wheel to zoom
          </p>
        </div>
      </aside>
    );
  }

  function patchAnswer(index: number, patch: Partial<{ text: string; comment: string; next: string }>): void {
    const current = node!.a ?? [];
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
    onUpdate(selectedId!, { a: newA });
  }

  function addAnswer(): void {
    const current = node!.a ?? [];
    onUpdate(selectedId!, { a: [...current, [''] as AnswerTuple] });
  }

  function removeAnswer(index: number): void {
    const current = node!.a ?? [];
    const newA = current.filter((_, i) => i !== index);
    onUpdate(selectedId!, { a: newA });
  }

  return (
    <aside className="jade-editor">
      <header className="jade-editor__head">
        <span className="jade-editor__id">{selectedId}</span>
        <span className="jade-editor__kind">
          {tree.openers.includes(selectedId) ? 'opener'
            : tree.roots.includes(selectedId) ? 'root'
              : 'followup'}
        </span>
      </header>

      <section className="jade-editor__section">
        <label className="jade-editor__label">question</label>
        <textarea
          className="jade-editor__textarea"
          value={node.q}
          rows={3}
          onChange={(e) => onUpdate(selectedId, { q: e.target.value })}
        />
      </section>

      <section className="jade-editor__section">
        <label className="jade-editor__label">format</label>
        <select
          className="jade-editor__select"
          value={node.f}
          onChange={(e) => onUpdate(selectedId, { f: e.target.value as AnswerFormat })}
        >
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </section>

      <section className="jade-editor__section">
        <label className="jade-editor__check">
          <input
            type="checkbox"
            checked={node.is_dark ?? false}
            onChange={(e) => onUpdate(selectedId, { is_dark: e.target.checked || undefined })}
          />
          <span>dark question (auto-append "pass")</span>
        </label>
      </section>

      <section className="jade-editor__section">
        <label className="jade-editor__label">default followup (next)</label>
        <select
          className="jade-editor__select"
          value={node.next ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onUpdate(selectedId, { next: v ? v : undefined });
          }}
        >
          <option value="">— none (return to root pool)</option>
          {allNodeIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </section>

      {(node.f === 'choice' || node.f === 'binary' || node.f === 'multi' || node.f === 'matrix') && (
        <section className="jade-editor__section">
          <label className="jade-editor__label">
            answers
            <button
              type="button"
              className="jade-editor__add"
              onClick={addAnswer}
            >+ add</button>
          </label>
          <div className="jade-editor__answers">
            {(node.a ?? []).map((tuple, i) => (
              <div key={i} className="jade-editor__answer">
                <input
                  className="jade-editor__answer-text"
                  type="text"
                  placeholder="answer text"
                  value={tuple[0] ?? ''}
                  onChange={(e) => patchAnswer(i, { text: e.target.value })}
                />
                <input
                  className="jade-editor__answer-comment"
                  type="text"
                  placeholder="comment (optional)"
                  value={tuple[1] ?? ''}
                  onChange={(e) => patchAnswer(i, { comment: e.target.value })}
                />
                <select
                  className="jade-editor__answer-next"
                  value={tuple[2] ?? ''}
                  onChange={(e) => patchAnswer(i, { next: e.target.value })}
                  title="answer-specific next override"
                >
                  <option value="">— use default</option>
                  {allNodeIds.map((id) => <option key={id} value={id}>→ {id}</option>)}
                </select>
                <button
                  type="button"
                  className="jade-editor__remove"
                  onClick={() => removeAnswer(i)}
                  aria-label="remove answer"
                >×</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {node.f === 'matrix' && (
        <section className="jade-editor__section">
          <label className="jade-editor__label">matrix axes (x · y)</label>
          <div className="jade-editor__axes">
            <input
              className="jade-editor__axis"
              type="text"
              placeholder="x low"
              value={node.axes?.[0][0] ?? ''}
              onChange={(e) => {
                const axes = node.axes ?? [['', ''], ['', '']];
                onUpdate(selectedId, { axes: [[e.target.value, axes[0][1]], axes[1]] });
              }}
            />
            <input
              className="jade-editor__axis"
              type="text"
              placeholder="x high"
              value={node.axes?.[0][1] ?? ''}
              onChange={(e) => {
                const axes = node.axes ?? [['', ''], ['', '']];
                onUpdate(selectedId, { axes: [[axes[0][0], e.target.value], axes[1]] });
              }}
            />
            <input
              className="jade-editor__axis"
              type="text"
              placeholder="y low"
              value={node.axes?.[1][0] ?? ''}
              onChange={(e) => {
                const axes = node.axes ?? [['', ''], ['', '']];
                onUpdate(selectedId, { axes: [axes[0], [e.target.value, axes[1][1]]] });
              }}
            />
            <input
              className="jade-editor__axis"
              type="text"
              placeholder="y high"
              value={node.axes?.[1][1] ?? ''}
              onChange={(e) => {
                const axes = node.axes ?? [['', ''], ['', '']];
                onUpdate(selectedId, { axes: [axes[0], [axes[1][0], e.target.value]] });
              }}
            />
          </div>
        </section>
      )}
    </aside>
  );
}
