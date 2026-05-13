import type { SurveyQuestion } from '../types';
import poolData from './pool.json';

// The question pool is authored as JSON (pool.json) so it can be edited /
// regenerated / hand-tuned without touching code. Schema is SurveyQuestion
// from ../types.ts. Add / remove / reshape entries in the JSON file;
// nothing else needs to change.

export const QUESTION_POOL: SurveyQuestion[] = poolData as unknown as SurveyQuestion[];

export function findQuestion(id: string): SurveyQuestion | undefined {
  return QUESTION_POOL.find((q) => q.id === id);
}
