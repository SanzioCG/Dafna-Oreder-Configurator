import type { GenerateResult, Template } from '@dafna/engine';

/**
 * Wizard steps (D-4, ADR-010): one colored card each. Step 0 ("start", ready-made models) is
 * not a pill. "review" = the full-screen presentation. D-9: a separate "hardware" step
 * (Mexanizmlar) before review, only when the configuration has a mechanism to choose, so the
 * customer cannot miss it ("Keyingi" always lands on it).
 */
export interface StepDef {
  key: string;
  labelKey: string;
  enabled: boolean;
  /** step colour token (card fill and the pill number) */
  color: string;
  /** template uiStep values whose engineering parameters staff see on this step */
  uiSteps: string[];
}

const SIZE: StepDef = {
  key: 'size',
  labelKey: 'step.size',
  enabled: true,
  color: 'var(--step-size)',
  uiSteps: ['size'],
};
const COLOR: StepDef = {
  key: 'color',
  labelKey: 'step.color',
  enabled: true,
  color: 'var(--step-color)',
  uiSteps: ['color'],
};
const INTERIOR: StepDef = {
  key: 'interior',
  labelKey: 'step.interior',
  enabled: true,
  color: 'var(--step-interior)',
  uiSteps: ['interior', 'doors'],
};
export const HARDWARE_STEP: StepDef = {
  key: 'hardware',
  labelKey: 'step.hardware',
  enabled: true,
  color: 'var(--step-hardware)',
  uiSteps: ['hardware'],
};
const REVIEW: StepDef = {
  key: 'review',
  labelKey: 'step.review',
  enabled: true,
  color: 'var(--step-review)',
  uiSteps: [],
};

/** Steps without a mechanism choice. */
export const STEPS: StepDef[] = [SIZE, COLOR, INTERIOR, REVIEW];
const WITH_HARDWARE: StepDef[] = [SIZE, COLOR, INTERIOR, HARDWARE_STEP, REVIEW];

/** The configuration has a mechanism the customer chooses: hinges (doors), slides (drawers). */
const PRESENT: Record<string, (r: GenerateResult) => boolean> = {
  hingeBrand: (r) => r.panels.some((p) => p.role === 'door'),
  slideBrand: (r) => r.panels.some((p) => p.role === 'drawer_front'),
};

/** Hardware params of the template the configuration actually has (shown on the step). */
export function hardwareParams(template: Template, result: GenerateResult) {
  return template.parameters.filter(
    (d) => d.uiStep === 'hardware' && d.customerVisible && PRESENT[d.key]?.(result),
  );
}

export function stepsFor(template: Template, result: GenerateResult): StepDef[] {
  return hardwareParams(template, result).length > 0 ? WITH_HARDWARE : STEPS;
}

export function neighbourStep(
  current: string,
  dir: 1 | -1,
  steps: StepDef[] = STEPS,
): StepDef | undefined {
  const i = steps.findIndex((s) => s.key === current);
  if (i < 0) return undefined;
  for (let j = i + dir; j >= 0 && j < steps.length; j += dir) {
    const s = steps[j];
    if (s?.enabled) return s;
  }
  return undefined;
}
