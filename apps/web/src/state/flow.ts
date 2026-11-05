/**
 * Customer flow (D-3a), explicit and testable:
 *
 *   configurator --present--> presentation --doorsClosed--> ready_to_confirm --confirm--> contact
 *        ^                        |                              |                          |  |
 *        +---------edit-----------+--------------edit------------+   ready_to_confirm <-back  |
 *                                                                                  submitted -+
 *
 * `submitted` (D-5) is terminal: "Yakunlash" / the countdown resets the whole session (the app
 * remounts, see App.tsx), so no event leaves it.
 *
 * The reveal animation state is separate (presentation/reveal.ts): `doorsClosed` is the only
 * thing the flow needs from it (the confirm button appears as soon as the doors have closed).
 * The submission itself (submitting / error / retry) is local to the contact screen.
 */
export type FlowState =
  'configurator' | 'presentation' | 'ready_to_confirm' | 'contact' | 'submitted';
export type FlowEvent = 'present' | 'doorsClosed' | 'confirm' | 'edit' | 'back' | 'submitted';

const TRANSITIONS: Record<FlowState, Partial<Record<FlowEvent, FlowState>>> = {
  configurator: { present: 'presentation' },
  presentation: { doorsClosed: 'ready_to_confirm', edit: 'configurator' },
  ready_to_confirm: { confirm: 'contact', edit: 'configurator' },
  contact: { back: 'ready_to_confirm', submitted: 'submitted' },
  submitted: {},
};

/** Next state, or null if the event is not allowed in this state (rejected, state unchanged). */
export function nextFlow(state: FlowState, event: FlowEvent): FlowState | null {
  return TRANSITIONS[state][event] ?? null;
}

/** true in every state that shows the presentation view (sheet hidden) */
export function isPresenting(state: FlowState): boolean {
  return state === 'presentation' || state === 'ready_to_confirm';
}
