// Detective agent — text-blob output, no tool call.

export { runDetective, blobToQueuedAssertion } from './agent';
export { DETECTIVE_SYSTEM_TEMPLATE } from './prompt';
export { parseDetectiveTextBlob, type DetectiveTextBlob } from './parseTextBlob';
