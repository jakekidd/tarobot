import type { Chapter } from './types';

/**
 * MVP: passthrough. The reading prompt produces tarobot-voiced text directly
 * in `Chapter.spoken_text`, so this just returns it.
 *
 * Production: this seam is reserved for a local uncensored LLM that takes
 * (intent, history) and produces more dynamic in-character text without a
 * round trip to a remote API.
 */
export function translateChapter(chapter: Chapter): string {
  return chapter.spoken_text;
}
