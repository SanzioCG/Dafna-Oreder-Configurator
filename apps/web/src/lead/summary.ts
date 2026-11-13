import {
  allMaterials,
  generate,
  getMaterial,
  resolveParams,
  wardrobeTemplate,
  type GenerateResult,
  type Params,
  type Template,
} from '@dafna/engine';
import { translate, type Lang } from '../i18n/translate';

/**
 * Human-readable summary of a configuration, for the manager (Google Sheets row, Telegram), the
 * presentation line and the customer (submitted screen). Pure: engine + dictionaries only.
 * D-8: per product (wardrobe, office pedestal, desk).
 */
export interface LeadSummary {
  /** templateId: 'wardrobe' | 'pedestal' | 'desk' */
  product: string;
  /** "Shkaf", "Ofis tumbasi", "Stol" */
  productName: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  /** "1360 × 1900 × 600" */
  sizeMm: string;
  /** "136 × 190 × 60 sm" */
  sizeCm: string;
  /** main decor: wardrobe / pedestal corpus, desk work top */
  corpus: string;
  /** second decor: wardrobe doors, pedestal fronts, desk legs / frame; null = none */
  door: string | null;
  /** supplier code of the two decors ("EGGER U727 ST9"), null for Dafna boards */
  corpusCode: string | null;
  doorCode: string | null;
  /** "Korpus: Белый шагрень · Eshik: Клён сахарный шампань" (labels per product) */
  colorsLine: string;
  /** wardrobe: sections + interior; pedestal: drawer layout; desk: legs */
  sections: string;
  /** wardrobe: doors per section; pedestal: base; desk: '' */
  doors: string;
}

const cm = (mm: number) => Math.round(mm / 10);

export function summarizeResult(
  params: Params,
  result: GenerateResult,
  lang: Lang,
  template: Template = wardrobeTemplate,
): LeadSummary {
  const t = (key: string, values?: Record<string, string | number>) => translate(lang, key, values);
  const label = (key: string, value: string) => {
    const k = `option.${key}.${value}`;
    const s = t(k);
    return s === k ? value : s;
  };
  const decor = (id: string | undefined) => {
    const m = id ? getMaterial(allMaterials, id) : undefined;
    return m ? t(m.decorName) : (id ?? '');
  };
  const code = (id: string | undefined) => (id && getMaterial(allMaterials, id)?.code) || null;
  const { params: p } = resolveParams(template, params);
  const w = Number(p.width);
  const h = Number(p.height);
  const d = Number(p.depth);
  const product = template.templateId;
  const role = (r: string) => result.panels.find((x) => x.role === r)?.material;

  let mainId: string | undefined;
  let secondId: string | undefined;
  let mainLabel = t('present.corpus');
  let secondLabel = t('present.door');
  let sections: string;
  let doors: string;
  if (product === 'desk') {
    mainId = role('worktop');
    secondId = role('leg') ?? role('frame');
    mainLabel = t('present.top');
    secondLabel = t('present.legs');
    sections = label('legs', String(p.legs));
    doors = '';
  } else if (product === 'pedestal') {
    mainId = role('side');
    secondId = role('drawer_front') ?? role('door');
    secondLabel = t('present.front');
    sections = label('layout', String(p.layout));
    doors = label('pedestalBase', String(p.base));
  } else {
    mainId = role('side');
    secondId = role('door');
    const parts = result.sections.map((s) => `${s.index + 1}) ${label('interior', s.preset)}`);
    sections = `${t('c.parts', { count: result.sections.length })}: ${parts.join('; ')}`;
    doors = result.sections
      .map((s) => `${s.index + 1}) ${label('doorSection', s.doorType)}`)
      .join('; ');
  }
  const main = decor(mainId);
  const second = secondId ? decor(secondId) : null;
  return {
    product,
    productName: t(`product.${product}`),
    widthMm: w,
    heightMm: h,
    depthMm: d,
    sizeMm: `${w} × ${h} × ${d}`,
    sizeCm: `${cm(w)} × ${cm(h)} × ${cm(d)} ${t('unit.cm')}`,
    corpus: main,
    door: second,
    corpusCode: code(mainId),
    doorCode: code(secondId),
    colorsLine: [`${mainLabel}: ${main}`, ...(second ? [`${secondLabel}: ${second}`] : [])].join(
      ' · ',
    ),
    sections,
    doors,
  };
}

export function summarizeParams(
  params: Params,
  lang: Lang = 'uz',
  template: Template = wardrobeTemplate,
): LeadSummary {
  return summarizeResult(params, generate(template, params), lang, template);
}
