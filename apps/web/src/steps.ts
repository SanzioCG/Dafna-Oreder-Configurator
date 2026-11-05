/** Wizard steps. D-1b: size, color, interior, doors active; review is a visible placeholder. */
export interface StepDef {
  key: string;
  labelKey: string;
  enabled: boolean;
}

export const STEPS: StepDef[] = [
  { key: 'size', labelKey: 'step.size', enabled: true },
  { key: 'color', labelKey: 'step.color', enabled: true },
  { key: 'interior', labelKey: 'step.interior', enabled: true },
  { key: 'doors', labelKey: 'step.doors', enabled: true },
  { key: 'review', labelKey: 'step.review', enabled: false },
];

export function neighbourStep(current: string, dir: 1 | -1): StepDef | undefined {
  const i = STEPS.findIndex((s) => s.key === current);
  for (let j = i + dir; j >= 0 && j < STEPS.length; j += dir) {
    const s = STEPS[j];
    if (s?.enabled) return s;
  }
  return undefined;
}
