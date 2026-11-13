import {
  PRODUCT_TEMPLATES,
  allMaterials,
  defaultParams,
  generate,
  getParamDef,
  validate,
  wardrobeTemplate,
  type GenerateResult,
  type ParamValue,
  type Params,
  type Template,
} from '@dafna/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Mode } from '../mode';
import { isCustomerBlocking } from './blocking';

/** the default product (the configurator starts with a wardrobe) */
export const TEMPLATE = wardrobeTemplate;
/**
 * Material lookup for the UI (names, colours): catalog 1.1.0 is a superset of every current
 * product's catalog. Engine calls use the catalog of their template (catalogForTemplate).
 */
export const CATALOG = allMaterials;

export interface ViewGeometry {
  result: GenerateResult;
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface Configurator {
  /** D-8: the product being configured ('wardrobe' | 'pedestal' | 'desk') and its template */
  product: string;
  template: Template;
  /** switch product (start screen): its template defaults, or the given params */
  switchProduct: (product: string, params?: Params) => void;
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

export { CUSTOMER_BLOCKING_WARNINGS, isCustomerBlocking } from './blocking';

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
export function repairCustomerParams(
  params: Params,
  template: Template = TEMPLATE,
): { params: Params; resets: AutoReset[] } {
  let out = params;
  const resets: AutoReset[] = [];
  for (let i = 0; i < 3; i++) {
    const blocked = validate(out, template)
      .filter((issue) => isCustomerBlocking(issue) && issue.paramKey)
      .map((issue) => ({ issue, def: getParamDef(template, issue.paramKey as string) }))
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

/**
 * Holds the parameter state and runs the engine. Generation takes well under a millisecond,
 * so it runs synchronously on every change (debounce = 0 ms, within the 50 ms budget).
 */
export function useConfigurator(mode: Mode = 'customer'): Configurator {
  const [template, setTemplate] = useState<Template>(TEMPLATE);
  const templateRef = useRef(template);
  templateRef.current = template;
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
        const repaired = repairCustomerParams(next, templateRef.current);
        next = repaired.params;
        // the option the customer just picked is never "auto-reset" (it was enabled, so valid)
        const resets = repaired.resets.filter((r) => r.key !== key);
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
        const repaired = repairCustomerParams(next, templateRef.current);
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

  // only staff can enter invalid values; the viewer keeps the last valid model of THIS product
  const lastValid = useRef<ViewGeometry | null>(null);

  const switchProduct = useCallback((product: string, initial?: Params) => {
    const next = PRODUCT_TEMPLATES[product] ?? TEMPLATE;
    const p = initial ?? defaultParams(next);
    templateRef.current = next;
    paramsRef.current = p;
    lastValid.current = null;
    setTemplate(next);
    setParamsState(p);
    setNotice(null);
  }, []);

  const result = useMemo(() => generate(template, params), [template, params]);
  const hasErrors = result.issues.some((i) => i.severity === 'error');

  const view = useMemo(
    () =>
      hasErrors
        ? (lastValid.current ??
          toView(generate(template, defaultParams(template)), defaultParams(template)))
        : toView(result, params),
    [hasErrors, result, params, template],
  );
  useEffect(() => {
    if (!hasErrors) lastValid.current = view;
  }, [hasErrors, view]);

  return {
    product: template.templateId,
    template,
    switchProduct,
    params,
    setParam,
    setParams,
    result,
    view,
    hasErrors,
    notice,
    dismissNotice,
  };
}
