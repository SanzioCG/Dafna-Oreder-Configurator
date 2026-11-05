/**
 * Uzbekistan phone numbers: the country code +998 is fixed in the UI, the customer types the
 * 9 national digits (operator code + subscriber number). Shared by the contact screen and the API.
 */
export const PHONE_COUNTRY_CODE = '+998';
export const PHONE_DIGITS = 9;

/** Keeps digits only, at most 9 (a pasted "+998 90 …" drops its country code). */
export function normalizePhoneDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.length > PHONE_DIGITS && digits.startsWith('998')) digits = digits.slice(3);
  return digits.slice(0, PHONE_DIGITS);
}

export function isValidPhone(digits: string): boolean {
  return new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(digits);
}

/** "901234567" -> "90 123 45 67"; partial input is grouped as far as it goes ("9012" -> "90 12"). */
export function formatPhoneDigits(digits: string): string {
  const d = normalizePhoneDigits(digits);
  const groups = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)];
  return groups.filter((g) => g.length > 0).join(' ');
}

/** "+998 90 123 45 67" (display). */
export function formatPhone(digits: string): string {
  const rest = formatPhoneDigits(digits);
  return rest ? `${PHONE_COUNTRY_CODE} ${rest}` : PHONE_COUNTRY_CODE;
}

/** "+998901234567" (storage, tel: links, Telegram auto-linking). */
export function phoneE164(digits: string): string {
  return `${PHONE_COUNTRY_CODE}${normalizePhoneDigits(digits)}`;
}
