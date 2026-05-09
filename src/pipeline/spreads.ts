import type { Spread } from './types';

// Layout coordinates are normalized; renderer scales them.
// Origin is centered; +x is right, +y is up, +z is toward camera.

export const FOUR_CARD_DIAMOND: Spread = {
  id: 'four-card-diamond',
  name: 'four-card diamond',
  description:
    'a diamond of four cards. top sets the situation; left and right ' +
    'are two paths through the choice; bottom is the unseen factor.',
  positions: [
    {
      id: 'top',
      role: 'situation',
      prompt_label:
        'TOP — what surrounds the choice; what is at stake right now',
      layout: { x: 0, y: 1.2 },
    },
    {
      id: 'left',
      role: 'path-a',
      prompt_label: 'LEFT — option A: what unfolds if this path is taken',
      layout: { x: -1.4, y: 0 },
    },
    {
      id: 'right',
      role: 'path-b',
      prompt_label: 'RIGHT — option B: what unfolds if this path is taken',
      layout: { x: 1.4, y: 0 },
    },
    {
      id: 'bottom',
      role: 'revelation',
      prompt_label:
        'BOTTOM — the revelation: an unseen factor, blindspot, ' +
        'or change vector the user is not accounting for',
      layout: { x: 0, y: -1.2 },
    },
  ],
};

export const ALL_SPREADS: Spread[] = [FOUR_CARD_DIAMOND];

export function getSpread(id: string): Spread | undefined {
  return ALL_SPREADS.find((s) => s.id === id);
}
