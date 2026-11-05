import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ru } from '../i18n/ru';
import { uz } from '../i18n/uz';
import type { SceneProps } from '../viewer/Scene';

// WebGL is not available in jsdom: a stub scene that exposes the configured width.
vi.mock('../viewer/Scene', () => ({
  MM: 0.001,
  Scene: ({ view }: SceneProps) => <div data-testid="viewer-stub" data-width={view.widthMm} />,
}));

const { App } = await import('../App');

type Sent = { url: string; body: Record<string, unknown> };
let sent: Sent[] = [];

/** fetch stub for /api/submit: each call takes the next answer */
function stubFetch(...answers: (() => Promise<Response>)[]) {
  sent = [];
  let i = 0;
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const answer = answers[Math.min(i++, answers.length - 1)]!;
    return answer();
  });
}
const ok =
  (id = 'DFN-261105-K7QM') =>
  () =>
    Promise.resolve(new Response(JSON.stringify({ id, status: 'submitted' }), { status: 200 }));
const down = () => () => Promise.reject(new TypeError('Failed to fetch'));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const flow = () => document.querySelector('.app')?.getAttribute('data-flow');
const stub = () => screen.getByTestId('viewer-stub');
const tab = (label: string) =>
  within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(label) });
const key = (k: string) =>
  fireEvent.click(document.querySelector(`.kb-key[data-key="${k}"]`) as HTMLElement);
const typeKeys = (text: string) => [...text].forEach((ch) => key(ch));
const field = (id: string) => document.getElementById(`contact-${id}`) as HTMLInputElement;
const submitBtn = () => screen.getByTestId('contact-submit') as HTMLButtonElement;
const next = () => fireEvent.click(screen.getByTestId('kb-next'));

function start() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: uz['start.scratch'] }));
}

function toContact(dict: Record<string, string> = uz) {
  fireEvent.click(tab(dict['step.review']!));
  fireEvent.click(screen.getByRole('button', { name: dict['present.skip']! }));
  fireEvent.click(screen.getByRole('button', { name: dict['present.confirm']! }));
  return screen.getByTestId('contact-screen');
}

function fillValid(name = 'aziz') {
  typeKeys(name);
  next(); // -> surname
  next(); // -> phone
  typeKeys('901234567');
  fireEvent.click(screen.getByTestId('contact-consent'));
}

describe('D-5 contact screen', () => {
  it('name field focused on entry, Latin keyboard, submit disabled until valid + consent', () => {
    start();
    toContact();
    expect(document.activeElement).toBe(field('firstName'));
    expect(screen.getByTestId('keyboard').dataset.layout).toBe('latin');
    expect(submitBtn().disabled).toBe(true);
    typeKeys('aziz');
    expect(field('firstName').value).toBe('Aziz'); // auto-capital at the start
    next();
    expect(document.activeElement).toBe(field('lastName'));
    next();
    expect(screen.getByTestId('keyboard').dataset.layout).toBe('numeric');
    typeKeys('901234567');
    expect(field('phone').value).toBe('90 123 45 67');
    expect(screen.getByText('+998')).toBeTruthy();
    expect(submitBtn().disabled).toBe(true); // consent missing
    fireEvent.click(screen.getByTestId('contact-consent'));
    expect(submitBtn().disabled).toBe(false);
    expect(submitBtn().textContent).toBe(uz['contact.submit']);
  });

  it('Cyrillic layout; errors only after blur; "Batafsil" opens the consent text', () => {
    start();
    toContact();
    fireEvent.click(screen.getByTestId('kb-script'));
    expect(screen.getByTestId('keyboard').dataset.layout).toBe('cyrillic');
    expect(document.querySelector('.kb-key[data-key="ў"]')).toBeTruthy();
    expect(screen.queryByText(uz['contact.err.firstName.required'])).toBeNull();
    fireEvent.blur(field('firstName'));
    expect(screen.getByText(uz['contact.err.firstName.required'])).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: uz['contact.consentMore'] }));
    expect(screen.getByTestId('consent-text').textContent).toBe(uz['contact.consentText']);
  });

  it('submits once: real ID on the submitted screen, size (sm) + colours, no secrets sent', async () => {
    stubFetch(ok());
    start();
    toContact();
    fillValid();
    await act(async () => fireEvent.click(submitBtn()));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('/api/submit');
    const body = sent[0]!.body;
    expect(body.contact).toEqual({
      firstName: 'Aziz',
      lastName: '',
      phone: '901234567',
      consent: true,
    });
    expect(body.lang).toBe('uz');
    expect(String(body.idempotencyKey).length).toBeGreaterThanOrEqual(16);
    expect((body.params as Record<string, unknown>).width).toBe(1360);
    expect(body.website).toBeUndefined(); // honeypot stays empty
    expect(JSON.stringify(body)).not.toMatch(/TOKEN|private_key|SHEET/i);
    expect(flow()).toBe('submitted');
    expect(screen.getByTestId('submitted-id').textContent).toBe('DFN-261105-K7QM');
    expect(screen.getByText(uz['submitted.title'])).toBeTruthy();
    expect(screen.getByText(uz['submitted.text'])).toBeTruthy();
    expect(screen.getByTestId('submitted-summary').textContent).toBe(
      '136 × 190 × 60 sm · Korpus: Oq · Eshik: Oq',
    );
  });

  it('submitting locks the form; an error keeps the data; "Qayta urinish" reuses the key', async () => {
    let release: (r: Response) => void = () => {};
    stubFetch(down(), () => new Promise<Response>((r) => (release = r)));
    start();
    toContact();
    fillValid();
    await act(async () => fireEvent.click(submitBtn()));
    expect(screen.getByTestId('contact-fail').textContent).toContain(uz['contact.fail.network']);
    expect(submitBtn().textContent).toBe(uz['contact.retry']);
    expect(field('firstName').value).toBe('Aziz');
    expect(field('phone').value).toBe('90 123 45 67');

    await act(async () => fireEvent.click(submitBtn()));
    expect(screen.getByTestId('contact-screen').dataset.state).toBe('submitting');
    expect(submitBtn().disabled).toBe(true);
    expect(submitBtn().getAttribute('aria-busy')).toBe('true');
    expect(field('firstName').disabled).toBe(true);
    expect((screen.getByTestId('contact-back') as HTMLButtonElement).disabled).toBe(true);
    expect(sent[1]!.body.idempotencyKey).toBe(sent[0]!.body.idempotencyKey);

    await act(async () =>
      release(new Response(JSON.stringify({ id: 'DFN-261105-ABCD', status: 'submitted' }))),
    );
    expect(screen.getByTestId('submitted-id').textContent).toBe('DFN-261105-ABCD');
  });

  it('server-side configuration error shows its own message', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'invalid_configuration' } }), { status: 422 }),
      ),
    );
    start();
    toContact();
    fillValid();
    await act(async () => fireEvent.click(submitBtn()));
    expect(screen.getByTestId('contact-fail').textContent).toContain(
      uz['contact.fail.invalid_configuration'],
    );
  });

  it('"Konfiguratsiyaga qaytish": back to the presentation, nothing lost', () => {
    start();
    fireEvent.click(
      screen.getByRole('button', { name: `${uz['param.width']}: ${uz['control.increase']}` }),
    );
    toContact();
    fireEvent.click(screen.getByTestId('contact-back'));
    expect(flow()).toBe('ready_to_confirm');
    fireEvent.click(screen.getByRole('button', { name: uz['present.edit'] }));
    expect(stub().dataset.width).toBe('1370');
  });
});

describe('D-5 session reset', () => {
  it('"Yakunlash": start screen, default configuration, kiosk theme, nothing kept', async () => {
    stubFetch(ok());
    start();
    fireEvent.click(screen.getByTestId('theme-toggle')); // customer picks Light
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(
      screen.getByRole('button', { name: `${uz['param.width']}: ${uz['control.increase']}` }),
    );
    toContact();
    fillValid();
    await act(async () => fireEvent.click(submitBtn()));
    fireEvent.click(screen.getByTestId('submitted-finish'));
    expect(screen.getByRole('button', { name: uz['start.scratch'] })).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('dark'); // kiosk default
    expect(window.localStorage.getItem('dafna.theme')).toBeNull();
    expect(screen.queryByTestId('contact-screen')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: uz['start.scratch'] }));
    expect(stub().dataset.width).toBe('1360');
  });

  it('the 45 s countdown also resets the session, language back to uz', async () => {
    stubFetch(ok());
    start();
    fireEvent.click(screen.getByRole('button', { name: ru['lang.ru'] }));
    toContact(ru);
    expect(screen.getByTestId('keyboard').dataset.layout).toBe('cyrillic'); // ru -> Cyrillic
    fillValid('азиз');
    expect(field('firstName').value).toBe('Азиз');
    vi.useFakeTimers();
    await act(async () => fireEvent.click(submitBtn()));
    expect(screen.getByTestId('submitted-countdown').textContent).toContain('45');
    await act(async () => vi.advanceTimersByTime(44_000));
    expect(screen.getByTestId('submitted-screen')).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(screen.queryByTestId('submitted-screen')).toBeNull();
    expect(screen.getByRole('button', { name: uz['start.scratch'] })).toBeTruthy();
  });
});
