import {
  defaultParams,
  generate,
  materialsV0,
  wardrobeTemplate,
  type GenerateResult,
  type ParamValue,
  type Params,
} from '@dafna/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
 * Holds the parameter state and runs the engine. Generation takes well under a millisecond,
 * so it runs synchronously on every change (debounce = 0 ms, within the 50 ms budget).
 */
export function useConfigurator(): Configurator {
  const [params, setParams] = useState<Params>(() => defaultParams(TEMPLATE));
  const setParam = useCallback((key: string, value: ParamValue) => {
    setParams((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

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
