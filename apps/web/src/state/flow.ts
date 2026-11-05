/**
 * Customer flow (D-3a), explicit and testable:
 *
 *   configurator --present--> presentation --doorsClosed--> ready_to_confirm --confirm--> contact
 *        ^                        |                              |                          |
 *        +---------edit-----------+--------------edit------------+          ready_to_confirm <-back
 *
 * The reveal animation state is separate (presentation/reveal.ts): `doorsClosed` is the only
 * thing the flow needs from it (the confirm button appears as soon as the doors have closed).
 * A future submission state (D-3b, D-2a) will hang off `contact`, independent of both.
 */
export type FlowState = 'configurator' | 'presentation' | 'ready_to_confirm' | 'contact';
export type FlowEvent = 'present' | 'doorsClosed' | 'confirm' | 'edit' | 'back';

const TRANSITIONS: Record<FlowState, Partial<Record<FlowEvent, FlowState>>> = {
  configurator: { present: 'presentation' },
  presentation: { doorsClosed: 'ready_to_confirm', edit: 'configurator' },
  ready_to_confirm: { confirm: 'contact', edit: 'configurator' },
  contact: { back: 'ready_to_confirm' },
};

/** Next state, or null if the event is not allowed in this state (rejected, state unchanged). */
export function nextFlow(state: FlowState, event: FlowEvent): FlowState | null {
  return TRANSITIONS[state][event] ?? null;
}

/** true in every state that shows the presentation view (sheet hidden) */
export function isPresenting(state: FlowState): boolean {
  return state === 'presentation' || state === 'ready_to_confirm';
}
