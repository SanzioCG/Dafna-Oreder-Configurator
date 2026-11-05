import {
  generate,
  getMaterial,
  materialsV0,
  resolveParams,
  wardrobeTemplate,
  type GenerateResult,
  type Params,
} from '@dafna/engine';
import { translate, type Lang } from '../i18n/translate';

/**
 * Human-readable summary of a configuration, for the manager (Google Sheets row, Telegram) and
 * the customer (submitted screen). Pure: engine + dictionaries only (no React, no DOM).
 */
export interface LeadSummary {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  /** "1360 × 1900 × 600" */
  sizeMm: string;
  /** "136 × 190 × 60 sm" */
  sizeCm: string;
  corpus: string;
  /** null when the wardrobe has no doors */
  door: string | null;
  /** "3 ta qism: 1) Shtanga + javon; 2) Javonlar; 3) Tortmalar + javonlar" */
  sections: string;
  /** "1) Ikki tabaqali; 2) Chap ilmoq; 3) Yo'q" */
  doors: string;
}

const cm = (mm: number) => Math.round(mm / 10);

export function summarizeResult(params: Params, result: GenerateResult, lang: Lang): LeadSummary {
  const t = (key: string, values?: Record<string, string | number>) => translate(lang, key, values);
  const label = (key: string, value: string) => {
    const k = `option.${key}.${value}`;
    const s = t(k);
    return s === k ? value : s;
  };
  const decor = (id: string | undefined) => {
    const m = id ? getMaterial(materialsV0, id) : undefined;
    return m ? t(m.decorName) : (id ?? '');
  };
  const { params: p } = resolveParams(wardrobeTemplate, params);
  const w = Number(p.width);
  const h = Number(p.height);
  const d = Number(p.depth);
  const corpusId = result.panels.find((x) => x.role === 'side')?.material;
  const doorId = result.panels.find((x) => x.role === 'door')?.material;
  const parts = result.sections.map((s) => `${s.index + 1}) ${label('interior', s.preset)}`);
  const doors = result.sections.map((s) => `${s.index + 1}) ${label('doorSection', s.doorType)}`);
  return {
    widthMm: w,
    heightMm: h,
    depthMm: d,
    sizeMm: `${w} × ${h} × ${d}`,
    sizeCm: `${cm(w)} × ${cm(h)} × ${cm(d)} ${t('unit.cm')}`,
    corpus: decor(corpusId),
    door: doorId ? decor(doorId) : null,
    sections: `${t('c.parts', { count: result.sections.length })}: ${parts.join('; ')}`,
    doors: doors.join('; '),
  };
}

export function summarizeParams(params: Params, lang: Lang = 'uz'): LeadSummary {
  return summarizeResult(params, generate(wardrobeTemplate, params), lang);
}
