import { validate, type ParamDef, type ParamValue, type Params } from '@dafna/engine';
import type { Mode } from '../mode';
import { CATALOG, GUARDED_STEPS, TEMPLATE } from '../state/useConfigurator';

/**
 * Customer mode: an option of a guarded step (doors, later interior) that would produce an
 * engine error is disabled. Returns the error code that blocks `option`, or null if selectable.
 * Staff mode keeps every option selectable (errors are shown in the staff panel instead).
 */
export function blockingIssue(
  def: ParamDef,
  option: ParamValue,
  params: Params,
  mode: Mode,
): string | null {
  if (mode === 'staff' || !GUARDED_STEPS.includes(def.uiStep)) return null;
  const error = validate({ ...params, [def.key]: option }, TEMPLATE, CATALOG).find(
    (i) => i.severity === 'error',
  );
  return error?.code ?? null;
}
