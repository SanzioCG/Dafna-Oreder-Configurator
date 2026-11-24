# Dafna konfiguratori — Figma dizayneri uchun topshiriq

Sana: 2026-11-24. Bu hujjat: nimalarni chizish kerak, qaysi tartibda va qanday qoidalar bilan.
Hozirgi ishlaydigan versiyani ko'rish: sayt (Vercel) va do'kondagi kiosk. Barcha matnlar o'zbek va
rus tillarida bo'ladi.

## 1. Loyiha qisqacha

Mijoz shkaf, ofis tumbasi yoki stolni o'zi yig'adi: o'lcham, rang, ichki qism, mexanizmlar. Natija
3D da ko'rinadi, narx serverda hisoblanadi, mijoz buyurtma qoldiradi. Dafna xodimlari esa boshqaruv
panelida (manager) narx, 1C katalogi va xodimlarni boshqaradi.

**Uch xil ekran:**

| Platforma        | O'lcham                           | Kim ishlatadi                          |
| ---------------- | --------------------------------- | -------------------------------------- |
| Kiosk (do'konda) | 1920 × 1080, gorizontal, sensorli | Mijoz do'konda, barmoq bilan           |
| Sayt — kompyuter | 1440 × 900                        | Mijoz uyda, sichqoncha                 |
| Sayt — telefon   | 390 × 844                         | Mijoz telefonda (eng ko'p shu bo'ladi) |
| Boshqaruv paneli | 1440 × 900                        | Admin va menejerlar                    |

## 2. Ish tartibi (prioritet)

1. **Dizayn tizimi** (ranglar, shriftlar, tugmalar, kartalar) — hamma narsa shundan quriladi.
2. **Mijoz yo'li — kiosk** (bosh ekran → buyurtma yuborildi).
3. **Mijoz yo'li — telefon** (xuddi shu yo'l, telefonga moslangan).
4. **Mijoz yo'li — sayt (kompyuter)**.
5. **Boshqaruv paneli** (kirish, bo'limlar, Xodimlar).
6. **Hujjatlar va xatlar**: buyurtma PDF, yig'ish yo'riqnomasi PDF, parol tiklash xati, Telegram
   xabari ko'rinishi, Google Sheet ranglari.

## 3. Dizayn tizimi (Figma: "Design system" sahifasi)

- **Logo**: DAFNA, "doimo birga" shiori. Oq va qora fonda, kichik o'lchamda ham o'qiladigan.
- **Ranglar** — token sifatida (nomi + qiymati), **yorug' va tungi rejim** uchun alohida:
  fon, karta, matn (asosiy / ikkinchi darajali), asosiy tugma, ikkinchi tugma, muvaffaqiyat
  (yashil), xato (qizil), ogohlantirish, chiziqlar. Hozir har bir qadamning o'z rangi bor
  (Joy — yashil, Rang — sariq, Ichki — binafsha, Mexanizmlar — to'q sariq, Ko'rib chiqish — ko'k):
  saqlansinmi yoki yangisi — dizayner taklif qiladi.
- **Kontrast**: matn va fon WCAG AA (4,5:1) dan kam bo'lmasin — dasturda avtomatik test bor.
- **Shrift**: lotin va kirill harflari (o'zbek: o', g', ʻ belgilari; rus) to'liq bo'lsin, bepul
  (Google Fonts). O'lchamlar: sarlavha, kichik sarlavha, matn, izoh, narx.
- **Komponentlar** (har biri barcha holatlari bilan: oddiy, bosilgan, faol, o'chirilgan,
  yuklanmoqda, xato):
  - Tugmalar: asosiy, ikkinchi, xavfli, faqat matn (havola), ikonali; kiosk uchun **kamida 48 px**
    balandlik.
  - Qadam tugmalari (1 Joy, 2 Rang …) — joriy, o'tilgan, keyingi holatlari.
  - O'lcham tanlash tugmalari ("110 sm / 150 sm / 170 sm"), slayder, son kiritish maydoni.
  - Rang namunasi (aylana + nom), guruhlar: "Bir xil ranglar", "Yog'och"; tanlangan belgi.
  - Almashtirgich (toggle): "Eshiklar boshqa rangda".
  - Mexanizm kartasi: brend, model, rasm, qisqa ma'lumot, "yumshoq yopiladi" belgisi.
  - Eshik turi rasmlari (yuqoridan ko'rinish, yon devorga nisbatan): nakladnoy, vkladnoy.
  - Narx bloki ("Narx: 2 926 000 so'm"), o'lcham satri ("100 × 210 × 60 sm · 2 ta qism").
  - Modal oyna, ogohlantirish (toast), bo'sh holat ("Ranglar hali qo'shilmagan").
  - 3D ustidagi elementlar: o'lcham yorliqlari (150 sm), "Markazlash", "Eshiklarni ochish",
    yo'riqnoma satri ("Bir barmoq — aylantirish …").
  - Ekran klaviaturasi (kiosk), QR kod bloki.
- **Ikonlar**: mahsulotlar (shkaf, tumba, stol), qadamlar, konsultant, til, tungi rejim — bitta
  uslubda, SVG.

## 4. Mijoz yo'li (kiosk, telefon, sayt — har biri alohida frame)

1. **Bosh ekran — "Nima buyurtma qilmoqchisiz?"**: Shkaf, Ofis tumbasi, Stol kartalari.
2. **Model tanlash**: tayyor modellar (rasm, nom, o'lcham) + "Noldan boshlash".
3. **Konfigurator** (asosiy ekran: chapda 3D, o'ngda panel; telefonda 3D tepada, panel pastda
   tortib ochiladigan):
   - **Shkaf**: Joy → Rang → Ichki (bo'limlar: polka, shtanga, tortma) → Mexanizmlar (petlya,
     yo'naltiruvchi brendlari) → Ko'rib chiqish.
   - **Ofis tumbasi**: Joy (g'ildirakli / g'ildiraksiz) → Rang → Tortmalar → Mexanizmlar →
     Ko'rib chiqish.
   - **Stol**: Joy → Rang (stol usti, oyoq) → Oyoqlar (LDSP yoki ko'tariladigan metall) →
     Ko'rib chiqish.
   - Har qadamda: narx yangilanib turadi; ogohlantirishlar (masalan "balandlik standartdan past").
4. **Ko'rib chiqish / taqdimot**: 3D aylanadi, tanlangan hamma narsa ro'yxati, narx,
   "Buyurtma berish".
5. **Aloqa ma'lumotlari**: ism, telefon (kioskda ekran klaviaturasi bilan), rozilik.
6. **Buyurtma yuborildi**: raqam, QR (telefonda davom ettirish uchun), kioskda orqaga sanash.
7. **Modallar**: "Konsultant chaqirish", "Hali shu yerdamisiz?" (kutish ogohlantirishi),
   server bilan aloqa yo'q, xato.
8. **Faqat sayt uchun**: yuqori menyu (logo, til, tungi rejim, "Bog'lanish"), pastki qism
   (manzil, telefon, Telegram, ish vaqti), "Loyihani saqlash / ulashish" (havola, QR).
9. **Xodim rejimi (kioskda)**: "Xodim kirishi" oynasi (login, parol), xodim paneli (hamma
   parametrlar, texnik ogohlantirishlar, narx tafsiloti).

## 5. Boshqaruv paneli (kompyuter, faqat o'zbekcha)

1. **Kirish**: login, parol, "Parolni unutdim".
2. **Parolni tiklash**: email kiritish → "havola yuborildi"; havoladan ochilgan "Yangi parol" sahifasi.
3. **"O'z parolingizni qo'ying"** (admin bergan vaqtinchalik parol bilan birinchi kirish) va
   "Parolni o'zgartirish".
4. **Asosiy tuzilma**: chapda bo'limlar menyusi, pastida xodim ismi + "Parolni o'zgartirish",
   "Chiqish"; tepada holat ("Saqlanmagan o'zgarishlar bor"), "1C narxlarini olish", "Saqlash".
5. Bo'limlar (har biri: jadval, qidiruv, bo'sh holat, yuklanmoqda, xato):
   - **1C katalogi**: papkalar (Materiallar / Furnitura / Boshqa), mahsulotlar rasm bilan,
     "Kioskda" belgisi, qo'shish oynasi (eman.uz rasmi bilan).
   - **Materiallar**: plitalar jadvali + material kartasi (rasm, o'lcham, narx, 1C kodi).
   - **Furnitura**: brend bo'yicha guruhlar, "Ma'lumot / rasm" oynasi.
   - **Xizmatlar**: m², metr, dona bo'yicha narxlar.
   - **Foyda va narx**: umumiy foiz va har mahsulotning yakuniy narxi.
   - **Xodimlar** (faqat admin): jadval (ism, login, email, rol, holati), yangi xodim formasi,
     bloklash, vaqtinchalik parol.

## 6. Hujjatlar, xatlar, jadval

- **Buyurtma PDF** (mijoz va menejer uchun): logo, raqam, sana, mahsulot rasmi, o'lchamlar,
  materiallar, narx. A4.
- **Yig'ish yo'riqnomasi PDF** (sex/o'rnatuvchi uchun): detallar ro'yxati, sxemalar.
- **Parol tiklash xati** (email): logo, salomlashish, katta "Yangi parol qo'yish" tugmasi,
  "30 daqiqa amal qiladi" izohi. Oddiy, telefonda ham to'g'ri ko'rinadigan.
- **Telegram xabari**: yangi buyurtma xabari qanday tartibda bo'lishi (matn shabloni).
- **Google Sheet ranglari** — jadvalni dastur o'zi to'ldiradi, dizayner faqat **ko'rinishini**
  beradi: sarlavha qatori rangi va shrifti, navbatma-navbat qator ranglari, holat ranglari
  (yuborildi — yashil, xato — qizil, kutilmoqda — sariq), ustun kengliklari. Varaqlar:
  **Arizalar** (buyurtmalar), **Narxlar**, **Katalog**, **Xodimlar**.

## 7. Qoidalar

- **Haqiqiy matnlar** bilan chizilsin (lorem ipsum emas). Rus matni o'zbekchadan uzunroq —
  ikkalasi ham sig'ishini tekshiring.
- Narx formati: `2 926 000 so'm` (bo'sh joy bilan); o'lcham: santimetrda (`150 sm`).
- Kioskda bosiladigan har narsa ≥ 48 px; telefonda ≥ 44 px.
- Har bir ekran **yorug' va tungi** rejimda.
- Auto Layout va komponent variantlari ishlatilsin (dasturchi ularni kodga ko'chiradi).
- Rasmlar SVG (ikon, sxema) yoki PNG/WebP (foto) eksport qilinadigan bo'lsin.
- **Figma sahifalari**: `Design system`, `Kiosk`, `Web — desktop`, `Web — mobile`, `Manager`,
  `Documents & email`, `Prototype`. Frame nomlari ekran nomi bilan (masalan
  `Kiosk / 2 Rang / Shkaf`).
- **Prototip**: mijoz yo'li boshidan oxirigacha bosib o'tiladigan bo'lsin (kiosk va telefon).
- Mavjud bo'lmagan funksiyani "ishlaydi" qilib chizmang — yangi g'oyalar alohida belgilansin
  ("taklif").
