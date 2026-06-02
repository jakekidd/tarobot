// The Subject Anchor section set as configuration.
//
// v3 §10/§12 of REFACTOR-V3.md: the section set is treated as
// configuration, not a fixed schema. Swap freely to experiment with
// different anchor shapes. The profiler reads this list to know
// which sections to emit, in what order.
//
// Discipline that survives any change:
//   - prose, not slots
//   - reference into the verbatim log for quotes
//   - suspicions FENCED (never quotable downstream)
//   - short enough to anchor (a page, not a dossier)

import ANCHOR_TEMPLATE_MD from '../../../materials/templates/anchor.md?raw';

export { ANCHOR_TEMPLATE_MD };

export type AnchorSection = {
  /** The exact `## <Heading>` text the profiler emits. */
  heading: string;
  /** Short one-line description of the section's job. Surfaced to the
   *  profiler in its payload so it knows what each header is for. */
  purpose: string;
  /** If true, downstream consumers (seer, augur) MUST NOT quote from
   *  this section. The profiler is also instructed to hedge here. The
   *  fence is the architectural enforcement that prevents the cop-sheet
   *  failure mode. */
  do_not_voice?: boolean;
};

/** Default section set, in order. Each entry maps 1:1 to a `## <heading>`
 *  the profiler emits. Edit / reorder / replace to swap templates. */
export const ANCHOR_SECTIONS: AnchorSection[] = [
  {
    heading: 'The Dilemma',
    purpose:
      "center of gravity. the delta — where they are now, where the reading is trying to move them — rendered as a fork with the do-nothing branch always explicit. note awareness (decides reveal vs. affirm downstream). state confidence. domain tag(s) inline. if no Dilemma has resolved, SAY so plainly — the engine routes to null-landing. never manufacture.",
  },
  {
    heading: 'Unsaid',
    purpose:
      "the inference layer — the real read. synthesized observations they did NOT volunteer and may not recognize. the gap between their self-story and the pattern underneath. this is what the reading surfaces.",
  },
  {
    heading: "What They'd Say About Themselves",
    purpose:
      "their own framing. how they narrate themselves; what they already know and would say aloud. the reading hands this back — it doesn't reveal it. reference the verbatim log for exact phrasing.",
  },
  {
    heading: 'Domain',
    purpose:
      "tag, not type. which subject-matter neighborhoods the Dilemma touches (work / love / belonging / shelter / family / self / mortality / meaning). conspicuous absences are findings.",
  },
  {
    heading: "How They're Holding It",
    purpose:
      "stance — governs delivery, not content. cooperative / guarded / skeptical / grieving / content / testing / performing / honest. how to be in the room with them.",
  },
  {
    heading: 'Suspicions — DO NOT VOICE',
    purpose:
      "fenced. leads only, never quotable downstream. low-confidence guesses worth steering toward but not asserting. quoting here is the cop-sheet failure.",
    do_not_voice: true,
  },
  {
    heading: 'Margin',
    purpose:
      "scribbles. anything that doesn't fit above. vibes, half-thoughts, things that might matter later.",
  },
];

/** Render the section list as a compact prompt-embedded block.
 *  Profiler reads this each call so it knows the active set. */
export function formatAnchorSectionsForPrompt(): string {
  return ANCHOR_SECTIONS.map((s, i) => {
    const fence = s.do_not_voice ? '  [DO NOT VOICE]' : '';
    return `${i + 1}. ## ${s.heading}${fence}\n   ${s.purpose}`;
  }).join('\n\n');
}

/** Just the headings, in order — used by the parser to validate
 *  profiler output structure. */
export function anchorSectionHeadings(): string[] {
  return ANCHOR_SECTIONS.map((s) => s.heading);
}
