# Bazis-Mebelshchik (.b3d) fayllari tahlili — Dafna konstruktiv qoidalari

Sana: 2026-11-23. Manba: shu papkadagi 7 ta `.b3d` fayl. Kod va shablonlar **o'zgartirilmadi**.
Ishlatilgan skriptlar (loyihadan tashqarida): session scratchpad `bazis\` (`extract.py`, `tlv.py`, `analyze2.py`).

## 0. Fayl formati (qanday o'qildi)

- Sarlavha `BZ85`, keyin ochiq jadval (`ID, Code, Name, Table, Header, Params, Article, Drawing, Encrypt,
Furniture, Materials, Thumbnail ...`). Ichida **2 ta zlib oqimi** bor:
  1. 256×256 rasm (thumbnail) — xom piksel;
  2. **model** (180 KB – 3 MB). Bu oqim shifrlanmagan, TLV (tag-length-value) daraxti:
     `uint32 maydon-ID, uint32 bolalar soni, uint8 tur` (0 = obyekt, 2/1 = bool, 3 = bayt, 4 = int32,
     5 = double, 6 = UTF-16 satr, 7 = blob). Maydon nomlari jadvali faylning boshida obfuskatsiya qilingan,
     shuning uchun maydonlar **ma'nosi bo'yicha** aniqlandi (tur kodi 4002 = panel, 3001 = furnitura,
     1005 = blok, 1001 = gabarit ramka).
- Har panelda: nom, material (`nom\rartikul`), qalinlik, **kontur** (blob: segmentlar, mm), pozitsiya +
  kvaternion (aylanish), kromkalar ro'yxati (kontur segmenti indeksi, kromka nomi, qalinligi). Shu sababli
  har panelning **dunyo koordinatalaridagi o'lchami va joyi** hisoblandi.
- Koordinatalar: X = eni, Y = balandlik (pol = 0), Z = chuqurlik, **Z max = old tomon** (eshiklar shu yerda —
  tasdiqlangan).
- Modeldan tashqari ichida `<Estimate>` XML bor (material, m², narx: LDSP 111 250 / m², HDF 60 000 / m²).
- Ehtiyot: deyarli har faylda **bir nechta model nusxasi** bor (variantlar, kutubxona bo'laklari, 16,5 mm
  Kronospan / 2 mm PVC kabi boshqa mahsulotlar). Quyida har faylning **birinchi (asosiy) modeli** olindi;
  boshqa nusxalar alohida belgilangan.

Ishonch darajasi: **"o'qildi"** = to'g'ridan-to'g'ri fayldagi raqam/nom; **"xulosa"** = raqamlardan chiqarilgan
talqin.

---

## 1. Fayllar bo'yicha

### 1.1 `shkaf garderob лестер.b3d` — kiyim shkafi (Lester seriyasi)

Asosiy model: **492 × 1830 × 400**, bitta vkladnoy eshik. Faylda yana 400×1830×400 (Egger H3453 eshik) va
800×1900×500 variantlari bor.

| Detal                                  | Material / qalinlik                  | O'lcham (kontur) | Joy (X / Y / Z)                          | Kromka (o'qildi)                            |
| -------------------------------------- | ------------------------------------ | ---------------- | ---------------------------------------- | ------------------------------------------- |
| krishka (tom)                          | LDSP antrasit 16                     | 492×400          | X 0..492, Y 1814..1830, Z 0..400         | 1,0 mm ×3 qirra + 0,4 mm ×1 qirra; `паз 12` |
| dno (pastki)                           | LDSP antrasit 16                     | 492×400          | X 0..492, Y 20..36, Z 0..400             | 1,0 ×3 + 0,4 ×1; `паз 12`                   |
| bok ×2                                 | LDSP antrasit 16                     | 398×1778         | X 2..18 / 474..490, Y 36..1814, Z 0..398 | 0,4 mm old+orqa qirra; `паз 12`             |
| zad_st (orqa)                          | HDF 3 (Белый Апельсин 5,796 / 05679) | 472×1794         | X 10..482, Y 28..1822, **Z 12..15**      | yo'q                                        |
| polka ×2 (qattiq)                      | LDSP antrasit 16                     | 456×366          | X 18..474, Z 15..381                     | 0,4 faqat old                               |
| fasad_lev (eshik)                      | LDSP dub sonoma 16                   | 450×1772         | X 21..471, Y 39..1811, Z 382..398        | 1,0 mm 4 qirra                              |
| 4× Бинго 2 см (FN004)                  | oyoqcha 20 mm                        | —                | Y 0, chetdan 50 mm                       | —                                           |
| 4× Петля горбатая с доводчиком (FP001) | —                                    | —                | Y 118 / 656 / 1194 / 1732                | —                                           |
| Вешалка гардеробный 350 мм (FSH001)    | штанга                               | —                | Y 1539 (yuqori polka ostida), Z 198      | —                                           |
| Ручка рим 160 мм (FR014)               | —                                    | —                | —                                        | —                                           |

Xulosa: tom yon devorlar **ustida**, pastki ham to'liq enida va yon devorlar **uning ustida turadi**
(yon devorlar tom va pastki **orasida**). Yon devorlar uchlardan 2 mm ichkarida, old tomondan 2 mm qisqa
(398 vs 400). Sokol yo'q — 20 mm "Бинго" oyoqchalar. Orqa HDF **pazda** (orqa qirradan 12 mm), har panelga
8 mm kiradi; qattiq polkalarga "саморез под ХДФ" bilan buraladi. Eshik vkladnoy, 3 mm tirqish (400-variantda
1,5 mm, Egger 0,8 mm kromka bilan).

### 1.2 `Lester Small.b3d` — 800 × 1500 × 400 shkaf (2 vkladnoy eshik + ochiq nisha)

- krishka/dno 800×400 to'liq enida (1,0 mm ×3 + 0,4 ×1), bok 398×1448 X 2..18 / 782..798 (0,4 old+orqa), `паз 12`.
- Orqa HDF 3 mm 780×1464, Z 12..15 (pazda, 8 mm kiradi).
- Eshiklar 379×1079, X 19,5..398,5 va 401,5..780,5, Y 37,5..1116,5 → **tirqish 1,5 mm** atrofida,
  **3 mm** tabaqalar orasida; old yuzasi yon devor bilan bir tekis (Z 398). Kromka 1,0 mm 4 qirra.
- Eshik ustida qattiq polka (Y 1118, chuqurligi 383, old qirrasi yon devor bilan tekis, 0,4 old).
- Olinadigan polkalar 762×366: har tomonda 1 mm bo'shliq (764 ichki), old qirra Z 381 = eshikdan 1 mm orqada
  (korpus oldidan 17 mm), kromka 0,4 **4 qirra**. Polkaderjatel 32-sistema, oldidan 50 mm / orqadan 60 mm.
- Petlya "вкладной с доводчиком": 3 dona 1079 mm eshikda, Y 118 / 577 / 1036 (eshik chetidan ≈ 80 mm,
  o'rtadagisi teng oraliqda).
- Biriktirish: Евровинт 6×50 (KE001 / KE00122334), "Стяжка от заданной базы 50" (ekssentrik), 4× Бинго 2 см.

### 1.3 `Shkaf Offis.b3d` — 800 × 1830 × 400 ofis shkafi

(Birinchi model qisman o'qildi — bitta ichki blok formatini o'qiy olmadim, shuning uchun bir guruh panellar
−330 mm siljigan holda chiqdi; nisbiy o'lchamlar ishonchli.)

- Tuzilma Lester Small bilan bir xil: tom/pastki to'liq enida, yon devorlar orasida, 2 mm ichkarida, `паз 12`,
  HDF orqa Z 12..15, Бинго 2 см.
- Kromka: yon devorlar va qattiq polka **0,6 mm** antrasit ("Кромка 19/0.6 Антрацит"), tom/pastki 1,0 ×3 + 0,6 orqa.
- Pastki vkladnoy eshiklar 377,5×692: **tirqish 3 mm** (yon devor, o'rta, past, polka ostida). 2 petlya, chetdan 80 mm.
- Olinadigan polkalar 762 en (1 mm/tomon): eshik orqasidagilar 366 chuqur (Z 15..381), **ochiq** qismdagilar
  378 chuqur (Z 15..393 → korpus oldidan **5 mm**). Kromka 0,6 mm 4 qirra.
- Qo'shimcha furnitura: Петля вкладной для стекло FP004, накладной для стекло доводчик FP453, Штангадержатель
  овал (2768), Вешалка 350 мм FSH001.

### 1.4 `Lester tuma sek.b3d` — 800 × 750 × 400 seksiyali tumba (2 vkladnoy eshik)

- Дно/Крыша 800×400 to'liq enida, **1,0 mm kromka 4 qirra**; yon devorlar 398×698 X 1..17 / 783..799
  (**1 mm** ichkarida), kromka 1,0 mm old+orqa; "Паз стандартный".
- Orqa HDF 3 mm 782×714, **Z 15..18** (paz orqa qirradan 15 mm, 8 mm kiradi).
- Eshiklar 378,5×692, X 20..398,5 / 401,5..780, Y 39..731 → **tirqish 3 mm** hamma joyda; Z 381..397 —
  yon devor oldidan **1 mm ichkarida**. 2 petlya "вкладной", Y 138 / 632 (eshik chetidan **99 mm**).
- Olinadigan polka 766×361,5 (yon devorlar orasida to'liq), Z 18,5..380 (eshikdan 1 mm orqada).
- Ножка бинго 20 мм (2639) / Бинго 2 см (FN004).
- Faylda boshqa mahsulotlar ham bor (garvard tumba 800×760×600, 16,5 mm Kronospan, PVC 2 mm) va kutubxona
  yashiklari — 1.5 bo'limdagi yashik qoidasi shu yerda ham takrorlanadi (13 mm/tomon, quti yon devori 120 mm).

### 1.5 `Tum mobil.b3d` — mobil tumba 430 × 550 × 550 (3 yashik)

| Detal                                                       | Material             | O'lcham     | Joy                                                   | Kromka                                  |
| ----------------------------------------------------------- | -------------------- | ----------- | ----------------------------------------------------- | --------------------------------------- |
| tom (tom)                                                   | LDSP antrasit 16     | 430×550     | Y 534..550, Z 0..550                                  | 1,0 mm 4 qirra                          |
| dno                                                         | LDSP antrasit 16     | 430×550     | Y 55..71                                              | 1,0 mm 4 qirra                          |
| bok ×2                                                      | LDSP antrasit 16     | 515×463     | X 5..21 / 409..425, Y 71..534, **Z 15..530**          | 0,6 mm old+orqa                         |
| ekran (orqa)                                                | **LDSP antrasit 16** | 388×463     | yon devorlar orasida, **Z 16..32**                    | yo'q                                    |
| Фасад.ящ ×3                                                 | LDSP dub sonoma 16   | **416×150** | X 7..423, Y 75..225 / 228..378 / 381..531, Z 530..546 | 1,0 mm 4 qirra; paz (дно uchun)         |
| Бок.ящ ×2 (har yashik)                                      | **LDSP antrasit 16** | **450×120** | X 34..50 / 380..396                                   | 0,6 (yoki 0,4) yuqori+pastki uzun qirra |
| Зад.перег.ящ                                                | LDSP 16              | 330×105     | yon devorlar orasida, Z 80..96                        | 0,6 yuqori qirra                        |
| Дно.ящ                                                      | HDF 3                | 348×457     | X 41..389, Z 82..539                                  | —                                       |
| Шариковые направляющие 450мм (3065)                         | —                    | 450         | —                                                     | —                                       |
| Ножка-ролик (108), to'plam "Ножки ролики" (3016) ×4         | —                    | —           | Y 0..55, chetdan 50 mm                                | —                                       |
| Замок мебельный FZ001 / 40×40 (278311), Ручка рим 160 FR014 | —                    | —           | yuqori yashikda                                       | —                                       |

Xulosa:

- **G'ildirak balandligi 55 mm** (pastki panel ostidagi tekislik Y = 55).
- Tom ham, pastki ham **to'liq o'lchamda** (430×550); yon devorlar ular **orasida**, tom chetidan 5 mm ichkarida,
  orqadan 15 mm qisqa.
- Orqa devor — **16 mm LDSP**, yon devorlar orasida, orqa qirradan 16 mm ichkarida (HDF emas).
- Fasadlar **nakladnoy**: yon devor tashqi yuzasidan 2 mm ichkarida; fasadlar orasi **3 mm**, pastki panel ustida
  **4 mm**, tom ostida **3 mm**. Fasad orqa yuzasi yon devor old qirrasiga tegadi (**tirqish 0**). Tom va pastki
  fasad yuzasidan **4 mm oldinga chiqib turadi** (546 vs 550).
- Yashik qutisi: yon devor va orqa **16 mm LDSP**; quti tashqi eni = teshik − 26 mm (**13 mm/tomon**, sharikli
  napravlyayushiy); quti uzunligi 450 = napravlyayushiy 450; **quti balandligi 120 mm** (fasad 150; boshqa
  kutubxona yashiklarida fasad 174 / 179 / 200 / 233 bo'lsa ham quti **doim 120**); quti pasti fasad pastidan
  **14 mm** yuqorida; dno HDF yon devor pazida (pastki qirradan ≈11,5 mm), fasad pazigacha kiradi (9 mm) —
  **fasad = qutining old devori** (alohida ichki old devor yo'q); orqa devor dno ustida turadi (105 mm);
  quti orqasidan orqa devorgacha ≈ **48 mm**.

### 1.6 `stol 1500.b3d` — "Стол лестер" 1500 × 750 × 700

| Detal                                 | Material                                                    | O'lcham                    | Joy                                        | Kromka                               |
| ------------------------------------- | ----------------------------------------------------------- | -------------------------- | ------------------------------------------ | ------------------------------------ |
| крышка с утолщением ×3 (ustki qatlam) | sonoma 380 + **antrasit 740** + sonoma 380, 16 mm           | 380/740/380 × 700          | Y 734..750                                 | faqat ranglar tutashgan qirralar 0,4 |
| утолщение (ostki qatlam)              | LDSP sonoma 16                                              | **1500×700 (to'liq list)** | Y 718..734                                 | **1 mm × 35 mm** 4 qirra             |
| нога левая/правая                     | LDSP sonoma 16                                              | 690×713                    | X 5..21 / 1479..1495, Y 5..718, Z 5..695   | 0,4 pastki qirra                     |
| утолщение (oyoq 2-qatlami) ×2         | LDSP sonoma 16                                              | 690×713                    | X 21..37 / 1463..1479                      | 0,4 past + **1×35** old+orqa         |
| экран ×3 (qatlamli)                   | antrasit 466 / sonoma 316 / antrasit 166 (balandlik), 16 mm | 1426 en                    | X 37..1463, Y 252/402/552..718, Z 617..665 | 0,4 pastki qirra                     |
| Подпятник белый ×4                    | 5 mm                                                        | —                          | chetdan 80 mm                              | —                                    |

Xulosa (Estimate dagi sonoma 4,02 m² bilan tekshirildi — mos):

- **Stol usti = 16 + 16 = 32 mm, ikkinchi qatlam to'liq list** (50 mm planka-ramka emas). Perimetr 35 mm
  kenglikdagi 1 mm kromka bilan bitta yopiladi (35 > 32). Ustki qatlam dizayn uchun 3 bo'lak (ikki rang).
- **Oyoq = 2 × 16 = 32 mm**, chuqurligi = stol chuqurligi − 2×5 mm (oldi/orqasidan **5 mm** ichkarida), stol
  uchlaridan ham **5 mm** ichkarida; 5 mm podpyatnik ustida.
- **Ekran (царга)** — 3 qatlamli zinapoya (48 mm paket), oyoqlar orasida, tom ostidan osilgan; eng chuqur qatlam
  466 mm (pastki qirrasi poldan 252 mm), tashqi yuzasi stol qirrasidan **35 mm** ichkarida. Bu qirra Bazisda
  "old" (Z max) tomonda — ya'ni foydalanuvchiga qarama-qarshi (mehmon) tomoni (xulosa).
- **Tuzatish (D-36, 2026-11-24, qayta o'qildi):** Z bo'yicha qatlamlar: 466 → Z 617..633 (eng ichkarida),
  316 → 633..649, **166 → 649..665 (eng tashqarida, qirradan 35 mm)**. Ya'ni eng qisqa qatlam tashqarida,
  shuning uchun oldidan uch rangli zinapoya ko'rinadi. Kabel-kanal qopqog'i ham shu tomonda (Z ≈ 530). Shablon
  0.4.0 da ekran orqada va eng baland qatlam tashqarida edi; 0.5.0 Bazis bilan bir xil (`desk-modesty-front`).
- Biriktirish: "Стяжка (симм32) отступ 80" (ekssentrik), шкант 8×40.

### 1.7 `porto.b3d` — "stol pristavnoy lester" 1100 × 750 × 600 (yonma-yon stol)

- столешница **bitta 16 mm** 1100×600, 1 mm kromka 4 qirra (bu stolda qalinlashtirish yo'q).
- нога ×2 16 mm (bir qatlam) 596×729: stol uchlaridan **2 mm**, oldi/orqasidan **2 mm** ichkarida; 1 mm kromka
  old+orqa, 0,4 pastki. Podpyatnik 5 mm (variant: "Ножка бинго фишка 14 мм" 66986, oyoq 720).
- царга 1064×350 oyoqlar orasida, tom ostida, **chuqurlik o'rtasida** (Z 292..308); 0,4–0,6 pastki qirra.
- Variant 1400 mm ham bor.

---

## 2. Materiallar va furnitura (o'qildi)

**Plitalar** (Estimate + model): ЛДСП антрацит 4.57 кв. УФА (0164), ЛДСП дуб сонома 4.57 кв. УФА (4786),
ЛДСП антрацит 5.8 кв. PE (KRONOSPAN) (0164), ЛДСП дуб сонома 5.8 кв. SN (KRONOSPAN) (3025), ЛДСП черный (0190),
дуб белый (K001), дуб серый (K002), дуб табачный (K004), дуб янтарный (K006), морское дерево винтаж (K015),
артвуд темный (K084), ЛДСП флитвуд серый лава 16 мм (EGGER H3453), Egger H1180 / H3330 / F186 / Tennessee Walnut
(boshqa modellar); ХДФ Белый Апельсин (лист) 5,796 (05679) va 5,175 (05702); ЛХДФ Белый 5,8 кв 2800×2070 (54),
5,17 кв 2500×2070 (2035).
**List o'lchamlari:** "5.8 / 5,796" = **2800×2070** (satrda ochiq yozilgan); HDF "5,175" = **2500×2070** (ochiq);
"4.57 / 4,575" = 4,575 m² → **2500×1830** (xulosa, satrda o'lcham yo'q).

**Kromka:** "Кромка 19,04 …" = 19 mm × 0,4 (Антрацид 09708, Вяз натуральный 05362, Орех Лион 05382…),
"Кромка 1/19" (ПВХ 1/19 KP119) = 1,0 mm, "Кромка 19/0.6 Антрацит" = 0,6 mm, "Кромка 35,1 Антрацит / Орех Лион
(CL61393-P066)" = 35 mm × 1 mm (stol), "Кромка Эггер 19/0,8" (Egger fasadlarda), PVC 2/19 (boshqa seriya).

**Furnitura:** Петля горбатая с доводчиком FP001 (vkladnoy), Петля накладной FP002, Петля вкладной для стекло
FP004, Петля накладной для стекло доводчик FP453, Петля для вкладной двери 142 / для накладной двери 99;
Шариковые направляющие 450 мм (3065), 350 мм (3063); Ножка-ролик 108 (to'plam 3016); Бинго 2 см FN004 /
Ножка бинго 20 мм 2639 / бинго фишка 14 мм 66986; Подпятник белый; Ручка рим 160 мм FR014 (2758),
Гарвард 192 мм 2785, Gamet 96 мм 94; Замок мебельный FZ001 / 40×40 278311; Вешалка гардеробный 350 мм FSH001,
Штангадержатель овал 2768; Евровинт 6×50 KE001 / KE00122334, 7×50; Болт эксцентриковой стяжки 102-02-03,
Минификс, шкант 8×40 (KSH40 / 82), саморез под ХДФ, шуруп 3×16 (116).
Brend nomi (Blum / Hettich / Boyard) **hech qayerda yo'q** — faqat Dafna/ta'minotchi artikullari.

---

## 3. Savol → Bazisda topilgan qiymat → bizdagi qiymat → ishonch

| #   | Savol                                | Bazisda topilgan (o'qildi / xulosa)                                                                                                                                                                                    | Bizdagi (shablon)                    | Ishonch                                                               |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| W1  | Shkaf: tom yon devor ustidami?       | Ha — tom to'liq enida, yon devorlar ostida (barcha shkaf/tumbalar)                                                                                                                                                     | `top-over-sides` (bir xil)           | yuqori                                                                |
| W2  | Pastki panel yon devorlar orasidami? | **Yo'q** — pastki ham to'liq enida, yon devorlar uning **ustida** turadi                                                                                                                                               | bottom between sides                 | yuqori (Lester seriyasi)                                              |
| W3  | Yon devorlar polgacha?               | **Yo'q** — yon devorlar Y 36 dan boshlanadi; pastki panel 20 mm oyoqchada                                                                                                                                              | `sides-to-floor`                     | yuqori (Lester seriyasi)                                              |
| W4  | Yon devor joyi                       | Uchlardan 2 mm ichkarida (tumbada 1 mm), old qirra tom/pastkidan 2 mm orqada (398/400)                                                                                                                                 | tekis                                | yuqori                                                                |
| W5  | Sokol balandligi / tuzilishi         | **Sokol yo'q**; 4× "Бинго 2 см" (FN004) 20 mm oyoqcha, chetlardan 50 mm                                                                                                                                                | plinth 100, strips between sides     | yuqori (bu fayllar uchun); boshqa mahsulotlarda sokol bo'lishi mumkin |
| W6  | Orqa devor materiali / qalinligi     | HDF 3 mm "Белый Апельсин" (05679 / 05702)                                                                                                                                                                              | hdf_white_3                          | yuqori                                                                |
| W7  | Orqa devor montaji                   | **Pazda**: paz orqa qirradan 12 mm (tumbada 15 mm), HDF har panelga 8 mm kiradi (en = ichki en + 16); qattiq polkalarga saморез bilan                                                                                  | overlay (mixlab)                     | yuqori                                                                |
| W8  | Eshik turi                           | Lester fayllarida **hammasi vkladnoy** (inset), yuzasi yon devor bilan tekis (tumbada 1 mm ichkarida); nakladnoy faqat kutubxona bo'lagida                                                                             | default overlay, inset variant bor   | yuqori                                                                |
| W9  | Vkladnoy eshik tirqishi              | **3 mm** (garderob 492, Offis, tumba) yoki **1,5 mm** (Lester Small, garderob 400) — atrofida; tabaqalar orasida **3 mm**                                                                                              | insetDoorGapMm 2                     | o'rta (fayllar o'zaro farq qiladi)                                    |
| W10 | Nakladnoy eshik tirqishlari          | Kutubxona bo'lagi: chetlarda 2 mm, tabaqalar orasida 2 mm (764 ramkada 2×379)                                                                                                                                          | edge 3 / between 3 / front 2         | past                                                                  |
| W11 | Polka orqaga surilishi               | Eshik orqasida: korpus oldidan **17 mm** (eshikdan 1 mm); ochiq polka: **5 mm**; orqa tomonda HDF oldidan (Z 15)                                                                                                       | shelfFrontSetbackMm 20               | yuqori                                                                |
| W12 | Olinadigan polka eni                 | Ichki en − 2 mm (1 mm/tomon); kromka 0,4 (yoki 0,6) **4 qirra**                                                                                                                                                        | —                                    | yuqori                                                                |
| W13 | Qattiq polka                         | To'liq ichki enida, kromka faqat old 0,4/0,6; HDF unga buraladi                                                                                                                                                        | —                                    | yuqori                                                                |
| W14 | Petlya soni                          | 692 mm eshik → 2, 1079 → 3, 1775 → 4 (FP001 горбатая с доводчиком)                                                                                                                                                     | —                                    | yuqori                                                                |
| W15 | Petlya joyi                          | Chetlardan ≈ **80 mm** (tumbada 99 mm), qolganlari teng oraliqda                                                                                                                                                       | —                                    | o'rta (obyekt nuqtasi = kosacha markazi deb hisoblandi)               |
| W16 | Kromka (ko'rinadigan qirralar)       | Eshik/fasad: **1,0 mm** 4 qirra (Egger dekorda 0,8 Egger); tom/pastki: 1,0 mm old + 2 uch, orqasi 0,4 (tumbada 4 qirra 1,0); yon devor: 0,4 (Offis 0,6, tumba 1,0) old+orqa; polka 0,4 old; HDF yo'q; kromka eni 19 mm | bitta 0,8 ABS placeholder            | yuqori (qiymatlar), o'rta (qaysi qirra orqa ekanligi)                 |
| W17 | Shtanga                              | "Вешалка гардеробный 350 мм" FSH001, yuqori polka ostida (obyekt nuqtasi polkadan 9 mm pastda), chuqurlik o'rtasida                                                                                                    | railAxisDrop 60, Ø25                 | past (obyekt nuqtasi = o'q emas bo'lishi mumkin)                      |
| W18 | Shkaf yashiklari                     | Garderob faylida yashik **yo'q**; yashik qoidalari tumbalardan (P-qatorlar)                                                                                                                                            | drawerFrontHeight 170 …              | —                                                                     |
| W19 | List o'lchami                        | 2800×2070 (5,8 m²), 2500×1830 (4,575 m², xulosa), HDF 2800×2070 / 2500×2070                                                                                                                                            | —                                    | yuqori / o'rta                                                        |
| P1  | G'ildirak balandligi                 | **55 mm** (Ножка-ролик 108, to'plam 3016), chetlardan 50 mm                                                                                                                                                            | castorHeightMm 50                    | yuqori                                                                |
| P2  | Tumba korpusi                        | Tom **va** pastki to'liq (430×550), yon devorlar orasida; yon devorlar chetdan 5 mm, orqadan 15 mm ichkarida                                                                                                           | top over sides, bottom between sides | yuqori                                                                |
| P3  | Tom fasadlar bilan tekismi?          | **Yo'q** — tom (va pastki) fasad yuzasidan **4 mm oldinga** chiqadi                                                                                                                                                    | top flush with fronts (D-23)         | yuqori                                                                |
| P4  | Tumba orqa devori                    | **16 mm LDSP** yon devorlar orasida, orqa qirradan 16 mm ichkarida                                                                                                                                                     | HDF overlay                          | yuqori                                                                |
| P5  | Fasad – korpus oldi tirqishi         | **0 mm** (fasad yon devor old qirrasiga tegadi)                                                                                                                                                                        | frontGapMm 2                         | yuqori                                                                |
| P6  | Fasad yon tomoni                     | Fasad yon devor tashqi yuzasidan 2 mm ichkarida (yon devor 14 mm yopiladi)                                                                                                                                             | frontSideGapMm 0 (tekis)             | yuqori                                                                |
| P7  | Fasadlar orasidagi tirqish           | **3 mm**                                                                                                                                                                                                               | drawerGapMm 3                        | yuqori                                                                |
| P8  | Pastki / yuqori tirqish              | Pastki panel ustida **4 mm**, tom ostida **3 mm**                                                                                                                                                                      | frontEdgeGapMm 2                     | yuqori                                                                |
| P9  | Quti materiali                       | Yon devor + orqa **16 mm LDSP** (korpus rangi), dno HDF 3 mm                                                                                                                                                           | —                                    | yuqori                                                                |
| P10 | Quti eni vs teshik                   | Teshik − **26 mm** (13 mm/tomon), sharikli 450 mm (3065)                                                                                                                                                               | drawerSlideClearanceMm 13            | yuqori (mos)                                                          |
| P11 | Quti balandligi                      | **Doim 120 mm** (fasad 150 → −30; boshqa fasadlarda ham 120)                                                                                                                                                           | front − 40                           | yuqori                                                                |
| P12 | Quti ko'tarilishi                    | Quti pasti fasad pastidan **14 mm** yuqori                                                                                                                                                                             | drawerBoxLiftMm 10                   | yuqori                                                                |
| P13 | Quti uzunligi / orqa bo'shliq        | Quti = napravlyayushiy uzunligi (450); orqasida ≈ 48 mm (550 chuqur korpusda)                                                                                                                                          | drawerBackClearanceMm 20, step 50    | yuqori (uzunlik), o'rta (bo'shliq qoidasi)                            |
| P14 | Quti konstruksiyasi                  | Fasad = qutining old devori; dno yon devor va fasad pazida; orqa devor yon devorlar orasida, dno ustida (105 mm)                                                                                                       | —                                    | yuqori                                                                |
| P15 | Kromka                               | Tom/pastki 1,0 mm 4 qirra; yon devor 0,6 old+orqa; fasad 1,0 4 qirra; quti yon devori 0,4/0,6 yuqori+pastki                                                                                                            | 0,8 placeholder                      | yuqori                                                                |
| D1  | Stol usti qalinligi                  | **16 + 16 = 32 mm**, ostki qatlam **to'liq list** (1500×700), planka emas                                                                                                                                              | 16 + 4× 50 mm planka                 | yuqori                                                                |
| D2  | Stol usti kromkasi                   | Perimetrda **1 mm × 35 mm** bitta lenta (ikkala qatlamni yopadi)                                                                                                                                                       | bir lenta 2× qalinlikni yopadi       | yuqori (mos)                                                          |
| D3  | Oyoq konstruksiyasi                  | **2 × 16 = 32 mm** (нога + утолщение), stol usti ostida; 5 mm podpyatnik                                                                                                                                               | bitta LDSP oyoq                      | yuqori                                                                |
| D4  | Oyoq chuqurlik bo'yicha surilishi    | Oldi va orqasidan **5 mm** (porto: 2 mm)                                                                                                                                                                               | legDepthInsetMm 25                   | yuqori                                                                |
| D5  | Oyoq uchlardan                       | Stol uchidan **5 mm** ichkarida (porto: 2 mm)                                                                                                                                                                          | flush ends                           | yuqori                                                                |
| D6  | Ekran balandligi / joyi              | 3 qatlam 466/316/166 mm (48 mm paket), tom ostidan; tashqi yuzasi qirradan **35 mm**; porto: 350 mm bitta, chuqurlik **o'rtasida**                                                                                     | 350 mm, orqadan 60 mm                | yuqori (o'qildi), o'rta (qaysi tomon "orqa")                          |
| D7  | Oyoq kromkasi                        | Old+orqa 1×35 (ikki qatlamga), pastki 0,4; porto: 1,0 old+orqa, 0,4 past                                                                                                                                               | —                                    | yuqori                                                                |

## 4. O'qib bo'lmagan / noaniq

- Maydon nomlari jadvali (fayl boshida) obfuskatsiya qilingan — ma'nolar tuzilma bo'yicha aniqlandi; burchak
  aylanishi, yoy (arc) konturlar va `Shkaf Offis` dagi bitta blok to'liq o'qilmadi (o'lchamlarga ta'sir qilmaydi).
- Petlya / shtanga / oyoqcha **nuqtasi** obyektning bog'lanish nuqtasi; aniq kosacha markazi, o'q balandligi
  emas bo'lishi mumkin.
- Kromka indeksi = kontur segmenti raqami (yon devor va oyoqlarda geometriya bilan tasdiqlandi); tom/pastkida
  0,4 mm qirra "orqa" ekanligi — xulosa.
- Paz chuqurligi to'g'ridan-to'g'ri yozilmagan: HDF har panelga 8 mm kiradi, demak paz ≥ 8 mm (xulosa).
- Bu fayllar **Lester seriyasi** (kichik, 20 mm oyoqchali, vkladnoy eshikli). 2000–2200 mm baland, sokolli,
  nakladnoy eshikli shkaflar uchun Dafna boshqa qoidadan foydalanishi mumkin — texnologdan so'rash kerak.
- Operatsiyalar (kesish, kromkalash narxi) Estimate ichida bo'sh.
