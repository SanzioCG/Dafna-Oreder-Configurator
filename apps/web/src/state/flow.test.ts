import { describe, expect, it } from 'vitest';
import { isPresenting, nextFlow, type FlowEvent, type FlowState } from './flow';

const STATES: FlowState[] = ['configurator', 'presentation', 'ready_to_confirm', 'contact'];
const EVENTS: FlowEvent[] = ['present', 'doorsClosed', 'confirm', 'edit', 'back'];

describe('flow state machine', () => {
  it('happy path: configurator -> presentation -> ready_to_confirm -> contact', () => {
    expect(nextFlow('configurator', 'present')).toBe('presentation');
    expect(nextFlow('presentation', 'doorsClosed')).toBe('ready_to_confirm');
    expect(nextFlow('ready_to_confirm', 'confirm')).toBe('contact');
    expect(nextFlow('contact', 'back')).toBe('ready_to_confirm');
  });

  it('editing returns to the configurator from the presentation states', () => {
    expect(nextFlow('presentation', 'edit')).toBe('configurator');
    expect(nextFlow('ready_to_confirm', 'edit')).toBe('configurator');
  });

  it('every other transition is rejected', () => {
    const allowed = new Set([
      'configurator:present',
      'presentation:doorsClosed',
      'presentation:edit',
      'ready_to_confirm:confirm',
      'ready_to_confirm:edit',
      'contact:back',
    ]);
    for (const s of STATES) {
      for (const e of EVENTS) {
        const key = `${s}:${e}`;
        if (allowed.has(key)) expect(nextFlow(s, e), key).not.toBeNull();
        else expect(nextFlow(s, e), key).toBeNull();
      }
    }
    // explicitly: no confirm before the doors closed, no contact from the configurator
    expect(nextFlow('presentation', 'confirm')).toBeNull();
    expect(nextFlow('configurator', 'confirm')).toBeNull();
    expect(nextFlow('contact', 'edit')).toBeNull();
  });

  it('presentation view in presentation and ready_to_confirm only', () => {
    expect(STATES.filter(isPresenting)).toEqual(['presentation', 'ready_to_confirm']);
  });
});
