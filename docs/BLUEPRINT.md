# EASY JAWI — Blueprint Produk & Spesifikasi Teknikal

> **Susun Huruf, Bina Perkataan, Jadi Juara!**
> Permainan papan perkataan Jawi asli (genre Scrabble/Sahibba). Tiada tanda dagangan, logo, tekstur, bunyi, susun atur papan atau kod pihak ketiga disalin.

Status setiap ciri: lihat [`DELIVERY_CHECKLIST.md`](./DELIVERY_CHECKLIST.md).

---

## 1. Ringkasan produk

| Perkara | Keputusan |
|---|---|
| Pengguna | Murid sekolah rendah Malaysia, guru, keluarga |
| Bahasa UI | Bahasa Melayu Malaysia (Rumi); kandungan permainan dalam Jawi |
| Platform | PWA responsif (360px → desktop), boleh dipasang & dimainkan luar talian |
| Mod | **Single Player** (manusia lawan bot MUDAH/SEDERHANA/SUKAR) — *siap*. **Multiplayer** 2–4 peranti — *siap, perlukan projek Firebase (lihat §6, `DEPLOY.md`)* |
| Stack | React 19 + TypeScript + Vite 7, Tailwind CSS 4, Zustand 5, Motion 12, Web Audio API, vite-plugin-pwa |
| Enjin | TypeScript tulen (`src/engine/*`) tanpa DOM — boleh dijalankan sama di pelayar dan Cloud Functions |

---

## 2. Spesifikasi peraturan (tepat)

### 2.1 Papan
- 13 × 13. Koordinat disimpan sebagai `x` = lajur **kiri → kanan** (0–12), `y` = baris **atas → bawah** (0–12).
- Petak tengah `(6,6)` = petak mula ★ (juga **2×P**).
- Susun atur asli **"Wau Bulan"** (`src/engine/board.ts`), simetri 8 hala, 45 petak bonus:
  - **3×P** (perkataan ganda tiga) × 8 · **2×P** × 9 (termasuk ★) · **3×H** (huruf ganda tiga) × 12 · **2×H** × 16.
  - Label bertulis pada petak (bukan warna sahaja) + `aria-label` penuh.
- Susun atur boleh dikonfigurasi: `symmetricLayout()` menerima senarai oktan.

### 2.2 Arah bacaan Jawi (KRITIKAL)
- **Mendatar: KANAN → KIRI.** Huruf logik pertama berada pada `x` terbesar; huruf seterusnya pada `x − 1`.
- **Menegak: ATAS → BAWAH** (`y + 1`).
- Teks perkataan dibina mengikut urutan bacaan → rentetan Unicode logik. **Tiada pembalikan rentetan.** Pelayar melakukan susun atur RTL dan pembentukan huruf bersambung (`dir="rtl" lang="ms-Arab"`).
- Grid papan sentiasa `dir="ltr"` supaya lajur `x` dipetakan terus ke kedudukan visual.

### 2.3 Jubin
- 7 jubin di rak. Jubin = huruf Jawi tunggal (bukan Rumi).
- Taburan & nilai **diterbitkan daripada kekerapan huruf dalam korpus permulaan** (`npm run tiles:derive` → `src/data/tile-distribution.json`): 86 jubin huruf + 2 joker (nilai 0). **BUKAN nilai rasmi Sahibba.**
  - Setiap huruf yang muncul dalam ≥ 10 perkataan mendapat ≥ 1 jubin; baki diagih ∝ kekerapan (kaedah baki terbesar, maks 11).
  - Nilai = `1 + round(log2(f_maks / f) × 1.25)`, had 1–10.
  - Huruf jarang (ة ث ذ ص ض ط ظ غ خ ز ش ۏ) tiada jubin — boleh dimainkan melalui **joker**.
- Joker: pemain memilih huruf melalui dialog; bernilai 0; masih mencetuskan gandaan perkataan.

### 2.4 Langkah sah
1. Sekurang-kurangnya 1 jubin; semua dalam papan; petak kosong; tiada dua jubin satu petak.
2. Semua jubin baharu **segaris** (mendatar ATAU menegak).
3. **Bersambung** — tiada petak kosong antara jubin baharu (jubin sedia ada boleh mengisi ruang).
4. **Langkah pertama**: ≥ 2 huruf dan melalui petak ★.
5. **Langkah seterusnya**: sekurang-kurangnya satu perkataan terbentuk mengandungi jubin sedia ada.
6. **Setiap** perkataan terbentuk (utama + silang, ≥ 2 huruf) mesti wujud dalam kamus diluluskan.
7. Mesej ralat khusus (BM) untuk setiap kegagalan: `OFF_BOARD`, `OCCUPIED`, `DUPLICATE_CELL`, `NOT_COLLINEAR`, `GAP`, `FIRST_MOVE_CENTER`, `FIRST_MOVE_TOO_SHORT`, `NOT_CONNECTED`, `UNKNOWN_WORD` (menyenaraikan perkataan), `BLANK_NEEDS_LETTER`, `TILE_NOT_OWNED`, `NOT_YOUR_TURN`, `STALE_VERSION`, `DUPLICATE_ACTION`, `SWAP_BAG_LOW`, `GAME_FINISHED`.

### 2.5 Pemarkahan
- Setiap perkataan baharu (utama + silang) dikira: jumlah nilai huruf × gandaan huruf (**jubin baharu sahaja**) × hasil darab gandaan perkataan (**jubin baharu sahaja**). Bonus petak hanya digunakan **sekali**.
- Bonus guna semua 7 jubin: **+40** (boleh dikonfigurasi `allTilesBonus`).
- Pratonton markah dipaparkan sebelum SAHKAN; dianimasi selepas disahkan enjin.

### 2.6 Tindakan giliran
| Tindakan | Syarat | Kesan |
|---|---|---|
| SAHKAN (main) | Langkah sah | Markah, cabut jubin baharu, giliran seterusnya |
| TUKAR | Beg ≥ max(7, bil. ditukar) | Cabut dahulu, kemudian pulangkan & kocok; 0 mata; habis giliran |
| LANGKAU | Sentiasa | 0 mata; habis giliran |
| MENYERAH | Bila-bila masa (dengan pengesahan) | Jubin dipulangkan ke beg; pemain disingkir |
| Tamat masa (pemasa pilihan) | Masa giliran habis | Dikira LANGKAU (`timeout`) |

### 2.7 Tamat permainan (2–4 pemain)
1. **Rak kosong**: beg kosong DAN seorang pemain menggunakan jubin terakhirnya.
2. **Tanpa mata**: `consecutiveScoreless ≥ 3 pusingan × bil. pemain aktif` (langkah 0 mata, tukar, langkau, tamat masa). Boleh dikonfigurasi `scorelessRoundsLimit`.
3. **Menyerah**: tinggal ≤ 1 pemain aktif.
- Bagi penamat (1) dan (2), setiap pemain aktif ditolak jumlah nilai jubin di rak **sekali sahaja** (`endPenalty`). Kemenangan melalui (3) menyerah **tidak** menolak baki jubin. Pemain yang menamatkan rak **tidak** menerima mata pihak lawan (keputusan reka bentuk; boleh ditukar).
- Pemenang = markah tertinggi di kalangan pemain aktif. Seri → **juara bersama** (`isTie`, `winners[]`). Pemain yang menyerah tidak boleh menang.

### 2.8 Mesin keadaan
```
setup ─createGame→ active(giliran N)
active ─applyAction→ validating ─ok→ applied → giliran N+1 | finished
                               └─ralat→ rejected (keadaan tidak berubah)
```
`applyAction()` adalah fungsi tulen: semak `phase`, **idempotensi** (`action.id` dalam `appliedActionIds`), **versi** (`expectedVersion === version`, compare-and-swap), giliran, pemilikan jubin, geometri, kamus, markah. Sedia untuk transaksi pelayan.

### 2.9 Rawak
- `Rng` (mulberry32) boleh benih — ujian berketentuan.
- Permainan sebenar dibenih daripada `crypto.getRandomValues`. Pelayan multiplayer mesti guna CSPRNG pelayan sendiri.

---

## 3. Pelan kanonik huruf Jawi (PERLU semakan pendidik)

| Isu | Polisi | Kod |
|---|---|---|
| Kaf | Kanonik **ک U+06A9**; `ك U+0643` dilipat | `VARIANT_FOLDS` |
| Ga | Kanonik **ݢ U+0762** (DBP Malaysia); `ڬ U+06AC`, `گ U+06AF` dilipat | `VARIANT_FOLDS` |
| Ya | Kanonik **ي U+064A**; `ی U+06CC` dilipat | `VARIANT_FOLDS` |
| Ha | Kanonik **ه U+0647**; `ھ U+06BE` dilipat | `VARIANT_FOLDS` |
| Hamzah | ء أ إ ؤ ئ **berbeza** — tidak digabung | NFC menggabung `ا + ٔ → أ` |
| Bentuk persembahan | U+FB50–FDFF, U+FE70–FEFF → NFKC ke huruf asas | `normalizeJawi` |
| Aksara halimunan | ZWJ/ZWNJ/ZWSP, LRM/RLM, ALM, BOM, tatweel dibuang | `normalizeJawi` |
| Harakat | Dibuang (ejaan Jawi biasa tidak guna); hamzah atas/bawah **tidak** dibuang | `HARAKAT` |
| Huruf serupa | پ ۋ ڼ ى ڢ **tidak** dilipat (huruf berbeza) — diberi amaran "mungkin ڤ/ۏ/ڽ/ي?" semasa import | `SUSPICIOUS_LOOKALIKES` |
| Unicode | NFC keseluruhan | — |
| Varian ejaan | Medan `variants[]` per entri — diterima validator; bot hanya main ejaan kanonik | `Lexicon` |

Fon: **Noto Naskh Arabic** (SIL OFL 1.1, via `@fontsource`) — disahkan meliputi semua huruf jubin termasuk ݢ ڠ ڤ ڽ ۏ چ ک (`unicode-range` U+0600–06FF, U+0750–077F).

---

## 4. Kamus

- Fail: `src/data/jawi-lexicon.json` — `{ meta, entries: [{ id, jawi, rumi, meaningMs, category, difficulty, approved, sourceNote, example?, variants?, pack }] }`.
- **1,375 entri permulaan** (v0.2.0), 20 kategori, tahap 1–3 — kata dasar, kata berimbuhan lazim (ber-, meN-, di-, ter-, pe-, -an) dan ~60 perkataan pendek 2–3 huruf yang memudahkan sambungan di papan. **Status: BELUM DISEMAK GURU** (`meta.reviewStatus = "pending-educator-review"`). Disusun oleh pembangun dengan bantuan AI merujuk prinsip Pedoman Umum Ejaan Jawi; definisi ditulis sendiri; tiada salinan kamus berhak cipta.
- Validator, bot dan bantuan menggunakan **satu instans `Lexicon` yang sama** (entri `approved` sahaja).
- **Laluan import guru** (CSV/JSON) dalam aplikasi (`#/guru`) + `npm run lexicon:validate`: normalisasi, huruf tidak dikenali + cadangan, pendua, berbilang perkataan, entri sedia ada — setiap baris ditolak diberi sebab.
- Hala tuju: 500+ → 2,000+ entri disemak; pek mengikut Darjah/topik.

---

## 5. Peta laluan UI

| Laluan (hash) | Skrin | Status |
|---|---|---|
| `#/` | Splash/intro → Laman utama | Siap |
| `#/main` | Pilih mod: SINGLE PLAYER / MULTIPLAYER | Siap |
| `#/single` | Pilih tahap MUDAH / SEDERHANA / SUKAR, nama, pemasa | Siap |
| `#/permainan` | Papan permainan (HUD, papan zum/seret, rak, bar tindakan) | Siap |
| `#/keputusan` | Upacara keputusan | Siap |
| `#/multi` | Status jujur multiplayer (belum disambung) | Siap (status) |
| `#/tutorial` | Tutorial interaktif dengan langkah sebenar | Siap |
| `#/kamus` | Kamus Jawi (cari, tapis kategori/tahap, butiran) | Siap |
| `#/tetapan` | Bunyi, kelantangan, getaran, gerakan, pemasa, bantuan | Siap |
| `#/sejarah` | Sejarah perlawanan (peranti ini) | Siap |
| `#/guru` | Import pek perkataan guru | Siap |

---

## 6. Multiplayer (dilaksana — pelayan berwibawa)

Kontrak bersama klien/pelayan: `src/multiplayer/protocol.ts`. Logik bilik tulen: `functions/src/rooms.ts`
(diuji dengan `MemoryRepo`), dibalut oleh `functions/src/index.ts` (Cloud Functions 2nd gen, `asia-southeast1`).
Panduan deploy & kos: [`DEPLOY.md`](DEPLOY.md).

### 6.1 Firestore
```
roomCodes/{code4}              { roomId, expiresAt } — kod 4 digit → roomId        (tiada akses klien)
rooms/{roomId}                 RoomDoc awam: status, hostUid, settings, players[], pending[], readerUids[], game (papan, bagCount, giliran, deadline, langkah terakhir, keputusan)
rooms/{roomId}/hands/{uid}     HandDoc { rack, version } — rak peribadi             (baca: pemilik sahaja)
rooms/{roomId}/moves/{nnnn}    log langkah yang disahkan                            (baca: ahli bilik)
serverState/{roomId}           GameState penuh: beg, semua rak, rngState            (tiada akses klien)
rateLimits/{uid}               kiraan cipta/sertai                                  (tiada akses klien)
```
Kod 4 digit (`"0427"` disimpan sebagai **string**, sifar di hadapan dikekalkan) berasingan daripada `roomId` rawak
(CSPRNG). Kod bukan rahsia: tamat tempoh, had kadar (cubaan salah dikira), kelulusan hos pilihan, tiada senarai bilik awam.
Kod dilepaskan serta-merta apabila permainan tamat.

### 6.2 Matriks kebenaran (Security Rules — tolak secara lalai, klien TIDAK menulis apa-apa)
| Dokumen | Baca | Tulis klien | Ujian |
|---|---|---|---|
| `rooms/{id}` | `uid ∈ readerUids` (pemain + permintaan menunggu); tiada `list` | ✗ | `tests/emulator/rules.test.ts` |
| `rooms/{id}/hands/{uid}` | `request.auth.uid == uid` sahaja | ✗ | rules + `functions.test.ts` (rak orang lain → `permission-denied`) |
| `rooms/{id}/moves/*` | ahli bilik | ✗ | rules |
| `roomCodes/*`, `serverState/*`, `rateLimits/*` | ✗ | ✗ | rules + `functions.test.ts` |

### 6.3 Callable Functions
`createRoom, joinRoom, approveJoin, setReady, updateSettings, startGame, gameAction (play/swap/pass/resign), claimTimeout,
heartbeat, leaveRoom` + berjadual `closeExpiredRooms` (tutup bilik tidak aktif, padam bilik lama).
Setiap satu berjalan dalam **transaksi Firestore** (semua bacaan sebelum tulisan) dan tindakan permainan memanggil
`applyAction()` yang sama seperti Single Player dengan `expectedVersion` + `actionId` (idempotensi: cubaan semula
rangkaian dijawab `duplicate`, tidak pernah dikira dua kali). Beg dikocok dengan CSPRNG pelayan.

Status bilik: `menunggu → sedia → bermain → tamat | tamat-tempoh`.
- **Tahap** ialah pratetap seluruh bilik (bantuan: MUDAH tanpa had, SEDERHANA 3, SUKAR 1 setiap pemain) — sama untuk semua.
  Menukar tetapan membatalkan SEDIA semua pemain; tetapan dikunci selepas MULA.
- **Pemasa**: pelayan menyimpan `turnDeadline`; mana-mana ahli boleh menuntut `claimTimeout` selepas tarikh akhir + 2 s
  (id tindakan `timeout-v{version}` → tepat satu langkau). Tanpa pemasa: pemain yang terputus > 2 minit dilangkau.
- **Kehadiran**: heartbeat 25 s; "terputus" selepas 70 s; peranan hos berpindah selepas 90 s.
- **Keluar** semasa permainan = menyerah; jubin dipulangkan ke beg; pemain lain meneruskan.
- **Sambung semula**: uid tanpa nama kekal selepas muat semula; `roomId`, draf dan susunan rak disimpan setempat.

### 6.4 Batasan diketahui (multiplayer)
- Had bantuan dikira pada peranti (bantuan dijana daripada rak pemain sendiri; penguatkuasaan pelayan tidak bermakna).
- Tiada "main semula" dalam bilik yang sama — cipta bilik baharu (kod boleh digunakan semula serta-merta).
- App Check belum diaktifkan (lihat `DEPLOY.md §5`).

---

## 7. Struktur folder

```
src/
  engine/        board.ts placement.ts score.ts dictionary.ts bag.ts bot.ts game.ts jawi.ts rng.ts tiles.ts types.ts
  data/          jawi-lexicon.json tile-distribution.json index.ts
  state/         settings.ts singleGame.ts history.ts teacherPacks.ts router.ts
  lib/           audio.ts haptics.ts
  components/    Board.tsx Tile.tsx TileRack.tsx GameHUD.tsx ActionBar.tsx JawiText.tsx BlankPicker.tsx WordPreview.tsx ...
  screens/       Splash Home ModeSelect DifficultySelect Game Results Multiplayer Tutorial Dictionary Settings History Teacher
  features/
    single/      store, controller, bot Web Worker, seret & lepas
    play/        useTileTable (meja jubin dikongsi SP/MP), SwapSheet, rackOrder
    multiplayer/ MultiplayerHome, Lobby, RoomScreen, MultiplayerTable, MpResults, api, useRoom, session
    dictionary/  Kamus Online Pintar: checker, preparePlay (pagar markah), cacheStore, firebaseBackend, adminApi, OnlineCheckPanel
  dictionary/    protocol.ts (kontrak kamus online klien/pelayan)
  multiplayer/   protocol.ts (kontrak klien/pelayan), view.ts
  lib/firebase.ts  SDK Firebase dimuat malas (hanya apabila Multiplayer dibuka)
functions/src/   index.ts (Cloud Functions), rooms.ts (logik bilik tulen), dictionary.ts (validateJawiWordOnline), repo.ts, firestoreRepo.ts
firestore.rules  firestore.indexes.json  firebase.json
scripts/         derive-tiles.ts validate-lexicon.ts build-embedded.ts export-review.ts apply-review.ts
tests/
  unit/          Vitest — enjin, kamus, bot, logik bilik multiplayer
  emulator/      Vitest + Emulator Suite — peraturan, Functions, pemadaman
  e2e/           Playwright — 360/390/768/1280px
  e2e-mp/        Playwright berbilang konteks terhadap emulator
docs/            BLUEPRINT.md DELIVERY_CHECKLIST.md DEPLOY.md KAMUS_ONLINE.md semakan/
```

---

## 8. Keputusan reka bentuk (lalai rasional — boleh diubah)

| Keputusan | Lalai | Sebab |
|---|---|---|
| Petak tengah | 2×P | Ganjaran langkah pertama |
| Bonus 7 jubin | 40 | Papan 13×13 lebih kecil daripada 15×15 |
| Had tanpa mata | 3 pusingan | Elak tamat terlalu awal dengan kamus kecil |
| Tukar jubin | beg ≥ 7 | Elak manipulasi penghujung |
| Penamat rak | tiada pindahan mata lawan | Mudah difahami kanak-kanak |
| Pemasa | MUDAH: tiada · SEDERHANA: pilihan · SUKAR: pilihan | Spesifikasi |
| Bantuan | MUDAH: tanpa had · SEDERHANA: 3 · SUKAR: 1 | Spesifikasi (sedikit/tiada di SUKAR) |
| Bot | Carian penuh kamus × kedudukan, nilai sebenar | Bukan skrip |

### Batasan diketahui
- Dengan 1,375 perkataan, simulasi bot lawan bot menggunakan 79–85 daripada 88 jubin dan beg habis dalam 7/8 permainan (dengan 530 perkataan: 52–81 jubin, beg habis 2/8). Penghujung permainan masih kerap tamat melalui had tanpa mata apabila rak tinggal huruf bernilai tinggi (ف ع ح ء ڽ).
- Bot dikira pada utas utama (purata ~70 ms, maksimum ~250 ms pada desktop); telefon lama mungkin lebih perlahan. Pindahan ke Web Worker ialah langkah seterusnya jika perlu.
- Bot single player berjalan di klien; rak bot boleh dilihat oleh pengguna teknikal dalam `localStorage`. Diterima untuk luar talian; multiplayer menyimpan semua rak di pelayan.
