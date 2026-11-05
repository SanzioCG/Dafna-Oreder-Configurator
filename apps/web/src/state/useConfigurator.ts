import {
  defaultParams,
  generate,
  getParamDef,
  materialsV0,
  validate,
  wardrobeTemplate,
  type GenerateResult,
  type Issue,
  type ParamValue,
  type Params,
} from '@dafna/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Mode } from '../mode';

export const TEMPLATE = wardrobeTemplate;
export const CATALOG = materialsV0;

export interface ViewGeometry {
  result: GenerateResult;
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface Configurator {
  params: Params;
  setParam: (key: string, value: ParamValue) => void;
  /** Engine result for the current params (may contain errors and then has no geometry). */
  result: GenerateResult;
  /** Last result that produced geometry — what the viewer shows. */
  view: ViewGeometry;
  hasErrors: boolean;
}

function toView(result: GenerateResult, p: Params): ViewGeometry {
  return {
    result,
    widthMm: Number(p.width),
    heightMm: Number(p.height),
    depthMm: Number(p.depth),
  };
}

/**
 * Customer mode blocks every engine error plus these warnings: an option that would produce one
 * is disabled (with a reason), and a change that would make the current option produce one
 * resets that option. Staff mode keeps everything selectable and just shows the issue.
 */
export const CUSTOMER_BLOCKING_WARNINGS = ['SHELF_SPAN'];

export function isCustomerBlocking(issue: Issue): boolean {
  return issue.severity === 'error' || CUSTOMER_BLOCKING_WARNINGS.includes(issue.code);
}

/**
 * Customer mode never shows an invalid or blocked model: if a change (e.g. a wider wardrobe)
 * makes a selected option blocked (doors = all_single -> DOOR_TOO_WIDE, sections = 1 ->
 * SHELF_SPAN), that option is reset to its template default (auto, which is always valid).
 * Only enum options are reset; numeric params are already clamped in customer mode.
 */
export function repairCustomerParams(params: Params): Params {
  let out = params;
  for (let i = 0; i < 3; i++) {
    const keys = validate(out, TEMPLATE, CATALOG)
      .filter((issue) => isCustomerBlocking(issue) && issue.paramKey)
      .map((issue) => getParamDef(TEMPLATE, issue.paramKey as string))
      .filter((d) => d && d.type === 'enum' && d.customerVisible && out[d.key] !== d.default);
    if (keys.length === 0) return out;
    out = { ...out };
    for (const d of keys) if (d) out[d.key] = d.default;
  }
  return out;
}

/**
 * Holds the parameter state and runs the engine. Generation takes well under a millisecond,
 * so it runs synchronously on every change (debounce = 0 ms, within the 50 ms budget).
 */
export function useConfigurator(mode: Mode = 'customer'): Configurator {
  const [params, setParams] = useState<Params>(() => defaultParams(TEMPLATE));
  const setParam = useCallback(
    (key: string, value: ParamValue) => {
      setParams((prev) => {
        if (prev[key] === value) return prev;
        const next = { ...prev, [key]: value };
        return mode === 'customer' ? repairCustomerParams(next) : next;
      });
    },
    [mode],
  );

  const result = useMemo(() => generate(TEMPLATE, params), [params]);
  const hasErrors = result.issues.some((i) => i.severity === 'error');

  // Only staff mode can enter invalid values; the viewer then keeps the last valid model.
  const lastValid = useRef<ViewGeometry | null>(null);
  const view = useMemo(
    () =>
      hasErrors
        ? (lastValid.current ??
          toView(generate(TEMPLATE, defaultParams(TEMPLATE)), defaultParams(TEMPLATE)))
        : toView(result, params),
    [hasErrors, result, params],
  );
  useEffect(() => {
    if (!hasErrors) lastValid.current = view;
  }, [hasErrors, view]);

  return { params, setParam, result, view, hasErrors };
}
