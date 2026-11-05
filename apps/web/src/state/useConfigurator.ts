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
  /** set several params at once (same customer repair + toast rules) */
  setParams: (patch: Params) => void;
  /** Engine result for the current params (may contain errors and then has no geometry). */
  result: GenerateResult;
  /** Last result that produced geometry — what the viewer shows. */
  view: ViewGeometry;
  hasErrors: boolean;
  /** customer mode: options the app reset because of another change (shown as a toast) */
  notice: ResetNotice | null;
  dismissNotice: () => void;
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
export const CUSTOMER_BLOCKING_WARNINGS = [
  'SHELF_SPAN',
  'RAIL_DEPTH_SHORT',
  'RAIL_HEIGHT_SHORT',
  'DRAWER_SECTION_TOO_WIDE',
];

export function isCustomerBlocking(issue: Issue): boolean {
  return issue.severity === 'error' || CUSTOMER_BLOCKING_WARNINGS.includes(issue.code);
}

/** One option the app changed on its own (never silently: the UI shows a toast). */
export interface AutoReset {
  key: string;
  from: ParamValue;
  to: ParamValue;
  /** issue code that blocked the old value, e.g. SHELF_SPAN */
  code: string;
}

/** A batch of auto-resets caused by one customer change; `id` restarts the toast timer. */
export interface ResetNotice {
  id: number;
  resets: AutoReset[];
}

/**
 * Customer mode never shows an invalid or blocked model: if a change (e.g. a wider wardrobe)
 * makes a selected option blocked (doors = all_single -> DOOR_TOO_WIDE, sections = 1 ->
 * SHELF_SPAN), that option is reset to its template default (auto, which is always valid).
 * Only enum options are reset; numeric params are already clamped in customer mode.
 * Returns the repaired params and every reset made, so the UI can tell the customer.
 */
export function repairCustomerParams(params: Params): { params: Params; resets: AutoReset[] } {
  let out = params;
  const resets: AutoReset[] = [];
  for (let i = 0; i < 3; i++) {
    const blocked = validate(out, TEMPLATE, CATALOG)
      .filter((issue) => isCustomerBlocking(issue) && issue.paramKey)
      .map((issue) => ({ issue, def: getParamDef(TEMPLATE, issue.paramKey as string) }))
      .filter(
        ({ def }) =>
          def && def.type === 'enum' && def.customerVisible && out[def.key] !== def.default,
      );
    if (blocked.length === 0) break;
    out = { ...out };
    for (const { issue, def } of blocked) {
      if (!def || out[def.key] === def.default) continue;
      resets.push({
        key: def.key,
        from: out[def.key] as ParamValue,
        to: def.default,
        code: issue.code,
      });
      out[def.key] = def.default;
    }
  }
  return { params: out, resets };
}

export function hasCustomerBlocking(params: Params): string | null {
  return validate(params, TEMPLATE, CATALOG).find(isCustomerBlocking)?.code ?? null;
}

/**
 * Customer numeric change (e.g. width 2400 with doors): if even after resetting options the
 * result is still blocked, the value is held at the nearest valid value between the requested
 * and the previous value (1 mm steps). Returns null if no such value exists (change rejected).
 */
export function nearestValidNumber(
  prev: Params,
  key: string,
  requested: number,
): { params: Params; resets: AutoReset[]; value: number; code: string } | null {
  const code = hasCustomerBlocking(repairCustomerParams({ ...prev, [key]: requested }).params);
  if (!code) return null;
  const from = Number(prev[key]);
  const dir = Math.sign(from - requested);
  for (let v = requested + dir; dir !== 0 && (dir > 0 ? v <= from : v >= from); v += dir) {
    const cand = repairCustomerParams({ ...prev, [key]: v });
    if (!hasCustomerBlocking(cand.params)) return { ...cand, value: v, code };
  }
  return null;
}

/**
 * Holds the parameter state and runs the engine. Generation takes well under a millisecond,
 * so it runs synchronously on every change (debounce = 0 ms, within the 50 ms budget).
 */
export function useConfigurator(mode: Mode = 'customer'): Configurator {
  const [params, setParamsState] = useState<Params>(() => defaultParams(TEMPLATE));
  const [notice, setNotice] = useState<ResetNotice | null>(null);
  // Latest params for synchronous repair outside the state updater (updaters must stay pure).
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const noticeId = useRef(0);

  const setParam = useCallback(
    (key: string, value: ParamValue) => {
      const prev = paramsRef.current;
      if (prev[key] === value) return;
      let next: Params = { ...prev, [key]: value };
      if (mode === 'customer') {
        const repaired = repairCustomerParams(next);
        next = repaired.params;
        // the option the customer just picked is never "auto-reset" (it was enabled, so valid)
        let resets = repaired.resets.filter((r) => r.key !== key);
        if (typeof value === 'number' && hasCustomerBlocking(next)) {
          const held = nearestValidNumber(prev, key, value);
          if (!held) return; // no valid value between: keep the previous state
          next = held.params;
          resets = [
            ...held.resets.filter((r) => r.key !== key),
            { key, from: value, to: held.value, code: held.code },
          ];
        }
        if (resets.length > 0) {
          noticeId.current += 1;
          setNotice({ id: noticeId.current, resets });
        }
      }
      paramsRef.current = next;
      setParamsState(next);
    },
    [mode],
  );

  /**
   * Several params at once (e.g. "apply to all sections"). Customer mode: the patch is applied as
   * a whole, then repaired; resets of keys outside the patch are announced like for setParam.
   */
  const setParams = useCallback(
    (patch: Params) => {
      const prev = paramsRef.current;
      const keys = Object.keys(patch);
      if (keys.every((k) => prev[k] === patch[k])) return;
      let next: Params = { ...prev, ...patch };
      if (mode === 'customer') {
        const repaired = repairCustomerParams(next);
        next = repaired.params;
        const resets = repaired.resets.filter((r) => !keys.includes(r.key));
        if (resets.length > 0) {
          noticeId.current += 1;
          setNotice({ id: noticeId.current, resets });
        }
      }
      paramsRef.current = next;
      setParamsState(next);
    },
    [mode],
  );
  const dismissNotice = useCallback(() => setNotice(null), []);

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

  return { params, setParam, setParams, result, view, hasErrors, notice, dismissNotice };
}
