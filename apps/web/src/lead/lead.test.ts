import { defaultParams, wardrobeTemplate } from '@dafna/engine';
import { describe, expect, it } from 'vitest';
import { submitApplication } from './api';
import { validateContact } from './contact';
import {
  formatPhone,
  formatPhoneDigits,
  isValidPhone,
  normalizePhoneDigits,
  phoneE164,
} from './phone';
import { summarizeParams } from './summary';

describe('phone (+998 + 9 digits)', () => {
  it('formats as "+998 90 123 45 67", partially while typing', () => {
    expect(formatPhone('901234567')).toBe('+998 90 123 45 67');
    expect(formatPhoneDigits('9012')).toBe('90 12');
    expect(formatPhoneDigits('')).toBe('');
    expect(formatPhone('')).toBe('+998');
    expect(phoneE164('901234567')).toBe('+998901234567');
  });

  it('keeps digits only, max 9; a pasted country code is dropped', () => {
    expect(normalizePhoneDigits('90-123 45 67')).toBe('901234567');
    expect(normalizePhoneDigits('+998 90 123 45 67')).toBe('901234567');
    expect(normalizePhoneDigits('9012345678')).toBe('901234567');
    expect(isValidPhone('901234567')).toBe(true);
    expect(isValidPhone('90123456')).toBe(false);
  });
});

describe('contact validation', () => {
  const ok = { firstName: 'Aziz', lastName: '', phone: '901234567', consent: true };
  it('valid: Latin, Uzbek apostrophes, Cyrillic, hyphen', () => {
    expect(validateContact(ok)).toEqual({});
    expect(validateContact({ ...ok, firstName: 'Oʻktam', lastName: 'Gʻulomov' })).toEqual({});
    expect(validateContact({ ...ok, firstName: 'Ўткир', lastName: 'Анна-Мария' })).toEqual({});
  });
  it('errors in form order', () => {
    expect(validateContact({ firstName: ' ', lastName: '1', phone: '', consent: false })).toEqual({
      firstName: 'required',
      lastName: 'invalid',
      phone: 'required',
      consent: 'required',
    });
    expect(validateContact({ ...ok, firstName: 'A'.repeat(51) }).firstName).toBe('invalid');
    expect(validateContact({ ...ok, phone: '9012' }).phone).toBe('invalid');
  });
});

describe('lead summary', () => {
  it('default wardrobe: sizes, decors, sections and doors in uz / ru', () => {
    const uz = summarizeParams(defaultParams(wardrobeTemplate), 'uz');
    expect(uz.sizeMm).toBe('1360 × 1900 × 600');
    expect(uz.sizeCm).toBe('136 × 190 × 60 sm');
    expect(uz.corpus).toBe('Oq');
    expect(uz.door).toBe('Oq');
    expect(uz.sections).toMatch(/^2 ta qism: 1\) .+; 2\) .+$/);
    expect(uz.doors).toMatch(/^1\) .+; 2\) .+$/);
    const ru = summarizeParams(defaultParams(wardrobeTemplate), 'ru');
    expect(ru.sizeCm).toBe('136 × 190 × 60 см');
  });
  it('no doors -> door null', () => {
    const s = summarizeParams({ ...defaultParams(wardrobeTemplate), doors: 'none' }, 'uz');
    expect(s.door).toBeNull();
  });
});

describe('submit client', () => {
  it('times out after the given time with a typed outcome, never throws', async () => {
    const never = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) =>
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted'))),
      )) as unknown as typeof fetch;
    const body = {
      idempotencyKey: 'k-0123456789abcdef',
      params: {},
      contact: { firstName: 'A', phone: '901234567', consent: true },
      lang: 'uz' as const,
    };
    expect(await submitApplication(body, never, 20)).toEqual({ ok: false, code: 'timeout' });
    const bad = (async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch;
    expect(await submitApplication(body, bad)).toEqual({ ok: false, code: 'storage_failed' });
  });
});
