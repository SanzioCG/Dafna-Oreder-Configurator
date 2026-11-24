/**
 * D-43: the configurator is a website (konfigurator.dafna.uz); a shop kiosk is one device running
 * it. A kiosk is opened once with `?kiosk=1` (remembered in this browser; `?kiosk=0` forgets it).
 * Only a kiosk keeps the kiosk behaviour: its own header with "Konsultant chaqirish", idle reset,
 * no page zoom / context menu, the dark theme by default. A website visitor gets the site header
 * with "Bog'lanish", the light theme by default and is never reset.
 */
export const KIOSK_KEY = 'dafna.kiosk';

export function isKioskDevice(search: string = window.location.search): boolean {
  const flag = new URLSearchParams(search).get('kiosk');
  try {
    if (flag === '1') window.localStorage.setItem(KIOSK_KEY, '1');
    if (flag === '0') window.localStorage.removeItem(KIOSK_KEY);
    return window.localStorage.getItem(KIOSK_KEY) === '1';
  } catch {
    return flag === '1';
  }
}

/**
 * D-43: Dafna's contacts on the website ("Bog'lanish"). The phone is the one on dafna.uz; the
 * Telegram link waits for Dafna (null = the button is not shown).
 */
export const DAFNA_CONTACT = {
  phone: '+998 78 555 33 55',
  tel: 'tel:+998785553355',
  telegram: null as string | null,
};
