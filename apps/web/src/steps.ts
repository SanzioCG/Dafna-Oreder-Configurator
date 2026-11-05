/**
 * Wizard steps (D-4, ADR-010): four steps, one colored card each. Step 0 ("start", ready-made
 * models) is not a pill. "review" = the full-screen presentation.
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

export const STEPS: StepDef[] = [
  {
    key: 'size',
    labelKey: 'step.size',
    enabled: true,
    color: 'var(--step-size)',
    uiSteps: ['size'],
  },
  {
    key: 'color',
    labelKey: 'step.color',
    enabled: true,
    color: 'var(--step-color)',
    uiSteps: ['color'],
  },
  {
    key: 'interior',
    labelKey: 'step.interior',
    enabled: true,
    color: 'var(--step-interior)',
    uiSteps: ['interior', 'doors'],
  },
  {
    key: 'review',
    labelKey: 'step.review',
    enabled: true,
    color: 'var(--step-review)',
    uiSteps: [],
  },
];

export function neighbourStep(current: string, dir: 1 | -1): StepDef | undefined {
  const i = STEPS.findIndex((s) => s.key === current);
  if (i < 0) return undefined;
  for (let j = i + dir; j >= 0 && j < STEPS.length; j += dir) {
    const s = STEPS[j];
    if (s?.enabled) return s;
  }
  return undefined;
}
