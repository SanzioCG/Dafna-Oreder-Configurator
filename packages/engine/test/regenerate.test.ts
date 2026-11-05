import { describe, expect, it } from 'vitest';
import {
  REGENERABLE_SINCE,
  TEMPLATE_ARCHIVE,
  defaultParams,
  generate,
  materialsV0,
  regenerateApplication,
  toOrderDraft,
  wardrobeTemplate,
  type OrderDraft,
} from '../src/index.js';
import { templateBefore } from '../src/migrate.js';
// Applications stored by the D-5 engine (template 0.5.0). NEVER regenerate these files to make
// a test pass: a diff here means stored applications would no longer reproduce (ADR-011).
import appDefault from './fixtures/applications/0.5.0.default.json' with { type: 'json' };
import appMixed from './fixtures/applications/0.5.0.w2400-4sections-mixed.json' with { type: 'json' };
import appBare from './fixtures/applications/0.5.0.d450-nodoors-noback-nobase.json' with { type: 'json' };

interface ApplicationFixture {
  templateVersion: string;
  params: Record<string, unknown>;
  expected: OrderDraft;
}
const FIXTURES: Record<string, ApplicationFixture> = {
  default: appDefault as unknown as ApplicationFixture,
  'w2400-4sections-mixed': appMixed as unknown as ApplicationFixture,
  'd450-nodoors-noback-nobase': appBare as unknown as ApplicationFixture,
};

describe('reproducibility: stored applications regenerate exactly (ADR-011)', () => {
  for (const [name, fx] of Object.entries(FIXTURES)) {
    it(`${fx.templateVersion} ${name}: regenerated order draft deep-equals the stored one`, () => {
      const r = regenerateApplication(fx.params, fx.templateVersion);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.draft).toEqual(fx.expected);
    });
  }

  it('the current template version has at least one application fixture', () => {
    expect(Object.values(FIXTURES).map((f) => f.templateVersion)).toContain(
      wardrobeTemplate.templateVersion,
    );
  });

  it('deterministic: same input twice -> deep-equal drafts; generatedAt is an input', () => {
    const p = defaultParams(wardrobeTemplate);
    const a = regenerateApplication(p, '0.5.0');
    const b = regenerateApplication(p, '0.5.0');
    expect(a).toEqual(b);
    const at = regenerateApplication(p, '0.5.0', { generatedAt: '2026-11-05T09:03:12.000Z' });
    expect(at.ok && at.draft.generatedAt).toBe('2026-11-05T09:03:12.000Z');
  });

  it('matches the live configurator path (generate + toOrderDraft) for the current template', () => {
    const p = FIXTURES['w2400-4sections-mixed']!.params;
    const live = toOrderDraft(p, generate(wardrobeTemplate, p), { now: () => new Date(0) });
    const r = regenerateApplication(p, wardrobeTemplate.templateVersion);
    expect(r.ok && r.draft).toEqual(live);
  });
});

describe('template archive', () => {
  it('holds every released template version, current one included, all loadable', () => {
    expect(Object.keys(TEMPLATE_ARCHIVE)).toEqual(['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0']);
    expect(TEMPLATE_ARCHIVE[wardrobeTemplate.templateVersion]).toBe(wardrobeTemplate);
    for (const [version, t] of Object.entries(TEMPLATE_ARCHIVE)) {
      expect(t.templateVersion).toBe(version);
      expect(t.parameters.length).toBeGreaterThan(0);
      expect(Object.keys(defaultParams(t)).length).toBe(t.parameters.length);
    }
  });

  it(`every version since ${REGENERABLE_SINCE} regenerates its defaults without errors`, () => {
    for (const [version, t] of Object.entries(TEMPLATE_ARCHIVE)) {
      const r = regenerateApplication(defaultParams(t), version);
      if (templateBefore(version, REGENERABLE_SINCE)) {
        // pre-application templates: generator retired before D-5 (see REGENERABLE_SINCE)
        expect(r).toEqual({
          ok: false,
          code: 'TEMPLATE_NOT_REGENERABLE',
          templateVersion: version,
        });
      } else {
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.draft.templateVersion).toBe(version);
          expect(r.draft.catalogVersion).toBe(materialsV0.catalogVersion);
          expect(r.draft.issues.filter((i) => i.severity === 'error')).toEqual([]);
          expect(r.draft.panels.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('unknown versions are typed failures, never throws', () => {
    expect(regenerateApplication({}, '9.9.9')).toEqual({
      ok: false,
      code: 'UNKNOWN_TEMPLATE_VERSION',
      templateVersion: '9.9.9',
    });
    expect(regenerateApplication({}, '0.5.0', { catalogVersion: 'x' })).toMatchObject({
      ok: false,
      code: 'UNKNOWN_CATALOG_VERSION',
    });
    expect(() => regenerateApplication(null, '0.5.0')).not.toThrow();
  });
});
