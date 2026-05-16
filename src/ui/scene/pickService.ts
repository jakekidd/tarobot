// Bridge between DOM pointer events and the scene's raycaster.
//
// TarobotScene (which owns the table layer) registers a picker function
// at mount; TableAnchor (a DOM div sitting at the table's screen rect)
// calls pickAt(clientX, clientY) on pointerdown and routes the resulting
// slot name to the engine.
//
// Module-level singleton: there is only ever one TarobotScene mounted.

import type { SlotName } from './cardSceneStore';

type Picker = (clientX: number, clientY: number) => SlotName | null;

let picker: Picker | null = null;

export function registerPicker(fn: Picker): void {
  picker = fn;
}

export function unregisterPicker(fn?: Picker): void {
  if (!fn || picker === fn) picker = null;
}

export function pickAt(clientX: number, clientY: number): SlotName | null {
  return picker ? picker(clientX, clientY) : null;
}
