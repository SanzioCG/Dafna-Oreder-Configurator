import { validate, type ParamDef, type ParamValue, type Params } from '@dafna/engine';
import type { Mode } from '../mode';
import { CATALOG, TEMPLATE, isCustomerBlocking } from '../state/useConfigurator';

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
): string | null {
  if (mode === 'staff') return null;
  const issue = validate({ ...params, [def.key]: option }, TEMPLATE, CATALOG).find(
    isCustomerBlocking,
  );
  return issue?.code ?? null;
}
