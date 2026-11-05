import type { Issue, ParamDef, ParamValue, Params, Template } from './types.js';

export interface ResolvedParams {
  /** Complete parameter set: valid input values, defaults for missing or invalid ones. */
  params: Params;
  issues: Issue[];
}

function issue(
  code: string,
  severity: Issue['severity'],
  paramKey: string | undefined,
  values: Issue['values'],
): Issue {
  const out: Issue = { code, severity, messageKey: `issue.${code}`, values };
  if (paramKey !== undefined) out.paramKey = paramKey;
  return out;
}

function formatValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

function checkValue(def: ParamDef, value: unknown): Issue | null {
  switch (def.type) {
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        return issue('INVALID_TYPE', 'error', def.key, {
          expected: 'int',
          value: formatValue(value),
        });
      }
      const min = def.min ?? Number.NEGATIVE_INFINITY;
      const max = def.max ?? Number.POSITIVE_INFINITY;
      if (value < min || value > max) {
        return issue('OUT_OF_RANGE', 'error', def.key, {
          value,
          min: def.min ?? '-∞',
          max: def.max ?? '∞',
        });
      }
      return null;
    }
    case 'enum': {
      const options = def.options ?? [];
      if (!options.some((o) => o === value)) {
        return issue('INVALID_OPTION', 'error', def.key, {
          value: formatValue(value),
          options: options.join(', '),
        });
      }
      return null;
    }
    case 'bool': {
      if (typeof value !== 'boolean') {
        return issue('INVALID_TYPE', 'error', def.key, {
          expected: 'bool',
          value: formatValue(value),
        });
      }
      return null;
    }
    default:
      return issue('INVALID_TYPE', 'error', def.key, { expected: String(def.type), value: '' });
  }
}

/**
 * Checks raw (untrusted) input against the template's parameter definitions.
 * Missing keys fall back to the default silently. Never throws.
 */
export function resolveParams(template: Template, input: unknown): ResolvedParams {
  const issues: Issue[] = [];
  const params: Params = {};
  const raw: Record<string, unknown> =
    input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  for (const def of template.parameters) {
    if (!Object.prototype.hasOwnProperty.call(raw, def.key) || raw[def.key] === undefined) {
      params[def.key] = def.default;
      continue;
    }
    const value = raw[def.key];
    const problem = checkValue(def, value);
    if (problem) {
      issues.push(problem);
      params[def.key] = def.default;
    } else {
      params[def.key] = value as ParamValue;
    }
  }

  const known = new Set(template.parameters.map((p) => p.key));
  for (const key of Object.keys(raw).sort()) {
    if (!known.has(key)) issues.push(issue('UNKNOWN_PARAM', 'warning', key, { key }));
  }

  return { params, issues };
}

/** Clamp a numeric value into the definition's [min, max] and round to an integer. */
export function clampParam(def: ParamDef, value: number): number {
  if (!Number.isFinite(value)) return Number(def.default);
  let v = Math.round(value);
  if (def.min !== undefined) v = Math.max(def.min, v);
  if (def.max !== undefined) v = Math.min(def.max, v);
  return v;
}

export { issue as makeIssue };
