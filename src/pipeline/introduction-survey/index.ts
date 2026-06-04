// Public surface of the IntroductionSurvey — the deterministic, AI-free
// first stage. UI imports the engine + types from here.

export { IntroductionSurvey } from './survey';
export { loadSurvey } from './load';
export {
  EMPTY_CHANNELS,
  type Amalgam,
  type Channels,
  type FacetReading,
  type IdentityBlock,
  type RawPortrait,
} from './types';
export type { SurveyDoc, SurveyFacet, SurveyOption } from './schema';
