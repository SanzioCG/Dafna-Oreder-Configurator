import { isValidPhone } from './phone';

/** Contact data of an application (lead). Shared by the contact screen and the API. */
export interface ContactInput {
  firstName: string;
  lastName?: string;
  /** 9 national digits, without +998 */
  phone: string;
  consent: boolean;
}

export type ContactField = 'firstName' | 'lastName' | 'phone' | 'consent';
export type ContactError = 'required' | 'invalid';
export type ContactErrors = Partial<Record<ContactField, ContactError>>;

export const NAME_MAX = 50;

/**
 * Letters (Latin, Cyrillic incl. Ў Қ Ғ Ҳ), the Uzbek apostrophes (ʼ ʻ ' ‘ ’), hyphen and space.
 * Must start with a letter.
 */
const NAME_RE =
  /^[\p{Script=Latin}\p{Script=Cyrillic}][\p{Script=Latin}\p{Script=Cyrillic}ʼʻ'‘’\- ]*$/u;

function nameError(value: string, required: boolean): ContactError | undefined {
  const v = value.trim();
  if (!v) return required ? 'required' : undefined;
  if (v.length > NAME_MAX || !NAME_RE.test(v)) return 'invalid';
  return undefined;
}

/** Field errors in form order (firstName, lastName, phone, consent); empty = valid. */
export function validateContact(c: ContactInput): ContactErrors {
  const errors: ContactErrors = {};
  const first = nameError(c.firstName, true);
  if (first) errors.firstName = first;
  const last = nameError(c.lastName ?? '', false);
  if (last) errors.lastName = last;
  if (!c.phone) errors.phone = 'required';
  else if (!isValidPhone(c.phone)) errors.phone = 'invalid';
  if (c.consent !== true) errors.consent = 'required';
  return errors;
}

/** Trims names and collapses inner whitespace (what is stored and shown to the manager). */
export function cleanContact(c: ContactInput): ContactInput {
  const clean = (s: string | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');
  return {
    firstName: clean(c.firstName),
    lastName: clean(c.lastName),
    phone: c.phone,
    consent: c.consent,
  };
}
