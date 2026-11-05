import {
  getParamDef,
  listUnconfirmed,
  toOrderDraft,
  type GenerateResult,
  type Issue,
  type Params,
} from '@dafna/engine';
import { useI18n, type Translate } from '../i18n/I18n';
import { CATALOG, TEMPLATE } from '../state/useConfigurator';

export function issueText(t: Translate, issue: Issue): string {
  const def = issue.paramKey ? getParamDef(TEMPLATE, issue.paramKey) : undefined;
  return t(issue.messageKey, { ...issue.values, param: def ? t(def.labelKey) : issue.paramKey });
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface StaffPanelProps {
  params: Params;
  result: GenerateResult;
}

/** Staff-only tools: all issues, order draft download, unconfirmed assumptions, panel list. */
export function StaffPanel({ params, result }: StaffPanelProps) {
  const { t } = useI18n();
  const unconfirmed = listUnconfirmed(TEMPLATE, CATALOG);

  const download = () => {
    const draft = toOrderDraft(params, result, { template: TEMPLATE, catalog: CATALOG });
    const stamp = draft.generatedAt.replace(/[:.]/g, '-');
    downloadJson(`dafna-order-draft-${stamp}.json`, draft);
  };

  return (
    <section className="staff" aria-label={t('mode.staff')}>
      <button type="button" className="btn btn-secondary btn-wide" onClick={download}>
        {t('staff.download')}
      </button>

      <h3>{t('staff.issues')}</h3>
      {result.issues.length === 0 ? (
        <p className="muted">{t('staff.noIssues')}</p>
      ) : (
        <ul className="issues">
          {result.issues.map((issue, i) => (
            <li key={`${issue.code}-${i}`} className={`issue issue-${issue.severity}`}>
              <span className="issue-severity">{t(`severity.${issue.severity}`)}</span>
              <span>{issueText(t, issue)}</span>
              <code>{issue.code}</code>
            </li>
          ))}
        </ul>
      )}

      <h3>{t('staff.panels', { count: result.panels.length })}</h3>
      <table className="panels">
        <thead>
          <tr>
            <th>{t('staff.panel.id')}</th>
            <th>{t('staff.panel.size')}</th>
            <th>{t('staff.panel.material')}</th>
          </tr>
        </thead>
        <tbody>
          {result.panels.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>
                {p.lengthMm} × {p.widthMm} × {p.thicknessMm}
              </td>
              <td>{p.material}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t('staff.assumptions')}</h3>
      <ul className="assumptions">
        {unconfirmed.map((u) => (
          <li key={`${u.kind}-${u.key}`}>
            <span className="badge-unconfirmed">{t(`staff.kind.${u.kind}`)}</span>{' '}
            <strong>
              {u.kind === 'param' ? t(u.def.labelKey, { n: u.def.appliesToSection }) : u.key}
              {u.kind === 'constant' &&
                ` = ${u.constant.value}${u.constant.unit ? ` ${u.constant.unit}` : ''}`}
              {u.kind === 'material' &&
                ` — ${t(u.material.decorName)}, ${u.material.thicknessMm} mm, ${u.material.colorHex}`}
            </strong>
            <p className="param-note">
              {u.kind === 'param'
                ? u.def.note
                : u.kind === 'constant'
                  ? u.constant.note
                  : u.kind === 'material'
                    ? u.material.note
                    : u.note}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
