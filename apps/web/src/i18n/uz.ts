/** Uzbek (Latin) — default language. This object defines the full key set. */
export const uz = {
  'app.brand': 'Dafna',
  'app.title': 'Shkaf konfiguratori',
  'lang.label': 'Til',
  'lang.uz': "O'zbekcha",
  'lang.ru': 'Русский',
  'mode.staff': 'Xodim rejimi',

  'step.size': "O'lcham",
  'step.color': 'Rang',
  'step.interior': "Ichki to'ldirish",
  'step.doors': 'Eshiklar',
  'step.review': "Ko'rib chiqish",
  'step.comingSoon': 'Tez orada',
  'step.size.title': "Shkaf o'lchamini tanlang",
  'step.size.hint': "Kenglik, balandlik va chuqurlikni sozlang — model darhol o'zgaradi.",

  'nav.back': 'Orqaga',
  'nav.next': 'Keyingi',
  'nav.nextSoon': 'Keyingi bosqichlar tez orada',

  'param.width': 'Kenglik',
  'param.height': 'Balandlik',
  'param.depth': 'Chuqurlik',
  'param.sections': "Bo'limlar soni",
  'param.panelThickness': 'Plita qalinligi',
  'param.backPanel': 'Orqa devor',
  'param.base': 'Asos',
  'param.plinthHeight': 'Tsokol balandligi',
  'param.plinthRecess': 'Tsokol chuqurlashuvi',

  'option.sections.auto': 'Avto',
  'option.backPanel.none': "Yo'q",
  'option.backPanel.hdf_overlay': 'HDF (ustidan)',
  'option.base.plinth': 'Tsokol bilan',
  'option.base.none': 'Tsokolsiz',

  'control.decrease': 'Kamaytirish',
  'control.increase': 'Oshirish',
  'unit.mm': 'mm',

  'summary.overall': "Umumiy o'lcham",
  'summary.sections': "{count} ta bo'lim",

  'viewer.hint':
    'Bir barmoq — aylantirish · Ikki barmoq — yaqinlashtirish · Ikki marta bosing — markazlash',
  'viewer.reframe': 'Markazlash',
  'viewer.invalid': "Parametrlarda xato bor — oxirgi to'g'ri model ko'rsatilmoqda",

  'staff.badge': 'Tasdiqlanmagan',
  'staff.issues': 'Xatolar va ogohlantirishlar',
  'staff.noIssues': "Muammo yo'q",
  'staff.download': 'Buyurtma qoralamasini yuklab olish (JSON)',
  'staff.assumptions': 'Tasdiqlanmagan konstruktiv qiymatlar',
  'staff.kind.param': 'parametr',
  'staff.kind.constant': 'konstanta',
  'staff.kind.rule': 'qoida',
  'staff.panels': 'Detallar ({count})',
  'staff.panel.size': 'U × E × Q, mm',
  'staff.panel.id': 'ID',
  'staff.panel.material': 'Material',
  'staff.onlyStaff': 'faqat xodim',
  'nav.steps': 'Bosqichlar',
  'severity.error': 'Xato',
  'severity.warning': 'Ogohlantirish',

  'issue.INVALID_TYPE': '{param}: noto\'g\'ri qiymat "{value}"',
  'issue.OUT_OF_RANGE': "{param}: {min}–{max} oralig'ida bo'lishi kerak (kiritildi: {value})",
  'issue.INVALID_OPTION': '{param}: "{value}" mumkin emas ({options})',
  'issue.GEOMETRY_INVALID': "Ichki o'lcham noldan kichik — konstruksiya mumkin emas",
  'issue.UNSUPPORTED_TEMPLATE': "Shablon qo'llab-quvvatlanmaydi: {generator}",
  'issue.UNKNOWN_PARAM': "Noma'lum parametr: {key}",
  'issue.SHELF_SPAN':
    "{sectionNumber}-bo'lim ichki kengligi {innerWidthMm} mm — {maxMm} mm dan katta (javon egilishi mumkin)",
} as const;

export type MessageKey = keyof typeof uz;
export type Messages = Record<MessageKey, string>;
