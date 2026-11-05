import type { Issue } from '@dafna/engine';

/**
 * Customer mode blocks every engine error plus these warnings: an option that would produce one
 * is disabled (with a reason), and a change that would make the current option produce one
 * resets that option. Staff mode keeps everything selectable and just shows the issue.
 */
export const CUSTOMER_BLOCKING_WARNINGS = [
  'SHELF_SPAN',
  'RAIL_DEPTH_SHORT',
  'RAIL_HEIGHT_SHORT',
  'DRAWER_SECTION_TOO_WIDE',
];

export function isCustomerBlocking(issue: Issue): boolean {
  return issue.severity === 'error' || CUSTOMER_BLOCKING_WARNINGS.includes(issue.code);
}
