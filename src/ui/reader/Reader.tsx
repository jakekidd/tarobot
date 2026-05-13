import { ReaderAnchor } from '../scene/ReaderAnchor';

type Mood = 'neutral' | 'thinking' | 'flipping' | 'reading' | 'sleeping';

type Props = {
  isSpeaking?: boolean;       // unused with the new scene model — kept for API
  mood?: Mood;                // also unused (scene reads its own state)
  size?: number;
};

/**
 * Reader is now a layout-only placeholder. It reserves a square area
 * via ReaderAnchor; the full-screen TarobotScene reads that area's
 * bounding box and renders Clat there. Props kept for API parity with
 * existing call sites.
 */
export function Reader({ size = 240 }: Props) {
  return <ReaderAnchor size={size} />;
}
