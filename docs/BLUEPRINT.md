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
| Mod | **Single Player** (manusia lawan bot MUDAH/SEDERHANA/SUKAR) — *siap*. **Multiplayer** 2–4 peranti — *Fasa 3, perlukan Firebase* |
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
  - Setiap huruf yang muncul dalam ≥ 5 perkataan mendapat ≥ 1 jubin; baki diagih ∝ kekerapan (kaedah baki terbesar, maks 11).
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
- Setiap pemain aktif ditolak jumlah nilai jubin di rak **sekali sahaja** (`endPenalty`). Pemain yang menamatkan rak **tidak** menerima mata pihak lawan (keputusan reka bentuk; boleh ditukar).
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
- **530 entri permulaan**, 18 kategori, tahap 1–3. **Status: BELUM DISEMAK GURU** (`meta.reviewStatus = "pending-educator-review"`). Disusun oleh pembangun dengan bantuan AI merujuk prinsip Pedoman Umum Ejaan Jawi; definisi ditulis sendiri; tiada salinan kamus berhak cipta.
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

## 6. Multiplayer (Fasa 3 — reka bentuk, belum dilaksana)

### 6.1 Firestore
```
rooms/{roomId}                 metadata awam: status, hostUid, settings, version, turn, scores, board, bagCount
rooms/{roomId}/players/{uid}   profil awam: nickname, ready, connected, lastSeen, score
rooms/{roomId}/privateHands/{uid}  rak peribadi (baca: pemilik sahaja)
rooms/{roomId}/moves/{moveId}  langkah yang disahkan (log)
roomCodes/{code4}              { roomId, expiresAt } — kod 4 digit → roomId (tidak boleh disenarai)
serverState/{roomId}           beg + benih (TIADA akses klien)
```
Kod 4 digit (`"0427"` disimpan sebagai **string**, kosong di hadapan dikekalkan) berasingan daripada `roomId` rawak. Kod bukan rahsia: tamat tempoh, had kadar, kelulusan hos, tiada senarai bilik awam.

### 6.2 Matriks kebenaran (Security Rules — tolak secara lalai)
| Dokumen | Baca | Tulis klien |
|---|---|---|
| `rooms/{id}` | ahli bilik | ✗ (Functions sahaja) |
| `rooms/{id}/players/{uid}` | ahli bilik | ✗ (Functions sahaja; `ready` melalui `setReady`) |
| `rooms/{id}/privateHands/{uid}` | `request.auth.uid == uid` sahaja | ✗ |
| `rooms/{id}/moves/*` | ahli bilik | ✗ |
| `roomCodes/*` | ✗ (`get` melalui `joinRoom` sahaja) | ✗ |
| `serverState/*` | ✗ | ✗ |

### 6.3 Callable Functions
`createRoom, joinRoom, approveJoin, setReady, startGame, submitMove, swapTiles, passTurn, resign, reconnect, leaveRoom, closeExpiredRooms (berjadual)` — setiap satu dalam **transaksi Firestore** dan memanggil `applyAction()` yang sama dengan `expectedVersion` + `action.id` (idempotensi). Status bilik: `menunggu → sedia → bermain → tamat | tamat-tempoh`.

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
    single/      useSinglePlayer.ts (bot loop, pemasa, bantuan)
    multiplayer/ README (Fasa 3)
scripts/         derive-tiles.ts validate-lexicon.ts
tests/
  unit/          Vitest — enjin, kamus, bot (permainan penuh)
  e2e/           Playwright — 360/390/768/1280px
docs/            BLUEPRINT.md DELIVERY_CHECKLIST.md
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
- Dengan 530 perkataan permulaan, papan cenderung "sesak" selepas ~60–80 jubin dan permainan tamat melalui had tanpa mata walaupun beg belum habis. Peluasan kamus (perkataan 2–3 huruf terutamanya) akan memperbaiki aliran.
- Bot single player berjalan di klien; rak bot boleh dilihat oleh pengguna teknikal dalam `localStorage`. Diterima untuk luar talian; multiplayer menyimpan rak di pelayan.
