import {
  validate,
  type ParamDef,
  type ParamValue,
  type Params,
  type Template,
} from '@dafna/engine';
import type { Mode } from '../mode';
import { TEMPLATE, isCustomerBlocking, repairCustomerParams } from '../state/useConfigurator';

/**
 * Customer mode: an enum option that would produce an engine error or a blocking warning
 * (SHELF_SPAN) is disabled. Returns the issue code that blocks `option`, or null if
 * selectable. Staff mode keeps every option selectable (issues show in the staff panel).
 */
export function blockingIssue(
  def: ParamDef,
  option: ParamValue,
  params: Params,
  mode: Mode,
  template: Template = TEMPLATE,
): string | null {
  if (mode === 'staff') return null;
  // what the customer would get: the option plus the automatic resets it causes (toast);
  // only an option that is still blocked after those resets is disabled
  const trial = repairCustomerParams({ ...params, [def.key]: option }, template, [def.key]).params;
  const issue = validate(trial, template).find(isCustomerBlocking);
  return issue?.code ?? null;
}
