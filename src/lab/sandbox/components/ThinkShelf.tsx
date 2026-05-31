// Sandbox component — ThinkShelf.
//
// Right-column shelf streaming the live thinking of agents during a
// run. Each chunk gets rendered as a paragraph in its agent's color.
// Latest chunk auto-scrolls into view. When an agent transitions
// from "running" to "next agent running," a small divider lands so
// the boundary between agents is visible.

import { useEffect, useRef } from 'react';
import type { SandboxConfig, ThoughtEntry } from '../types';

type Props = {
  thoughts: ThoughtEntry[];
  config: SandboxConfig;
  runningAgentId: string | null;
};

export function ThinkShelf({ thoughts, config, runningAgentId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thoughts.length]);

  // Group thoughts by their agent for visual clarity — consecutive
  // chunks from the same agent merge into a single paragraph.
  const groups: { agentId: string; texts: string[] }[] = [];
  for (const t of thoughts) {
    const last = groups[groups.length - 1];
    if (last && last.agentId === t.agentId) {
      last.texts.push(t.text);
    } else {
      groups.push({ agentId: t.agentId, texts: [t.text] });
    }
  }

  return (
    <div className="sb-think-shelf">
      <div className="sb-think-shelf__head">
        <span className="bench__field-label">thinking</span>
        {runningAgentId && (
          <span
            className="sb-think-shelf__active"
            style={{ color: config.agents[runningAgentId]?.color ?? 'inherit' }}
          >
            {config.agents[runningAgentId]?.name ?? 'agent'} ●
          </span>
        )}
      </div>
      <div ref={scrollRef} className="sb-think-shelf__scroll">
        {groups.length === 0 ? (
          <div className="bench__empty">no thoughts yet — hit run</div>
        ) : (
          groups.map((g, i) => {
            const agent = config.agents[g.agentId];
            const color = agent?.color ?? '#888';
            return (
              <div key={i} className="sb-think-group">
                <div
                  className="sb-think-group__head"
                  style={{ color }}
                >
                  {agent?.name ?? '(deleted)'}
                </div>
                <div
                  className="sb-think-group__text"
                  style={{ borderLeftColor: color }}
                >
                  {g.texts.join('')}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
