# EASY JAWI

> **Susun Huruf, Bina Perkataan, Jadi Juara!**

Permainan papan perkataan Jawi asli (genre Scrabble/Sahibba) untuk murid, guru dan keluarga Malaysia. Jubin ialah huruf Jawi; perkataan mendatar dibaca **kanan → kiri**, menegak **atas → bawah**.

| | Status |
|---|---|
| Single Player (lawan bot MUDAH / SEDERHANA / SUKAR) | ✅ Siap & diuji |
| Enjin peraturan, pemarkahan, kamus, bot | ✅ Siap & diuji (Vitest) |
| UI responsif 360 → 1280px, PWA, bunyi, animasi | ✅ Siap & diuji (Playwright) |
| Tutorial interaktif, Kamus, Sejarah, Mod Guru | ✅ Siap & diuji |
| **Multiplayer 2–4 peranti** | ⏳ **Fasa 3 — belum dilaksana** (perlukan Firebase). Skrin Multiplayer memaparkan status jujur; butang bilik dimatikan. |
| Kamus permulaan (1,375 perkataan, termasuk kata berimbuhan) | ⚠️ **BELUM DISEMAK GURU** |

Butiran: [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) · Senarai semak: [`docs/DELIVERY_CHECKLIST.md`](docs/DELIVERY_CHECKLIST.md)

## Mula pantas

Perlu Node.js 20+ (diuji pada Node 22).

```bash
npm install
```

```bash
npm run dev
```

Buka http://localhost:5173. Tambah `?seed=123` pada URL untuk beg jubin berketentuan (demo/ujian).

## Ujian

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

- `npm test` — 67 ujian unit Vitest: normalisasi Unicode Jawi, arah RTL, semua penolakan langkah, pemarkahan, joker, bonus 7 jubin, tamat permainan/seri, idempotensi & versi, kamus, taburan jubin, permainan penuh bot-lawan-bot (3 tahap, 2–4 pemain).
- `npm run test:e2e` — Playwright pada 360/390/768/1280px terhadap binaan produksi (`vite preview`). Jika pelayar Playwright belum dipasang: `npx playwright install chromium`.

## Data

```bash
npm run lexicon:validate
```

```bash
npm run lexicon:validate -- path/ke/pek-guru.csv
```

```bash
npm run tiles:derive
```

- `src/data/jawi-lexicon.json` — kamus permulaan (`jawi, rumi, meaningMs, category, difficulty, approved, sourceNote, example?, variants?`).
- `src/data/tile-distribution.json` — **diterbitkan** daripada kekerapan huruf kamus (jalankan `tiles:derive` selepas mengubah kamus; ujian unit akan gagal jika fail tidak dikemas kini). Bukan nilai rasmi Sahibba.
- Guru boleh mengimport pek CSV/JSON dalam aplikasi (**Mod Guru**, `#/guru`); pek disimpan pada peranti.

## Bina & deploy (Single Player — tiada pelayan diperlukan)

```bash
npm run build
```

Output statik dalam `dist/` (termasuk service worker PWA). Contoh hos:

```bash
npx firebase-tools deploy --only hosting
```

(Perlu `firebase.json` dengan `"public": "dist"` dan projek Firebase anda sendiri — belum disediakan dalam repo ini.) Vercel/Netlify: arahan binaan `npm run build`, direktori output `dist`. Laluan menggunakan `#hash`, jadi tiada peraturan rewrite diperlukan. Pengehosan mungkin dikenakan kos oleh penyedia.

### Halaman tunggal (tanpa pelayan, tanpa service worker)

```bash
npm run build:embedded
```

Menghasilkan satu fail HTML dengan JS, CSS dan fon disertakan (`dist-embedded/easy-jawi.html`), sesuai untuk hos yang hanya menerima satu halaman. Dalam binaan ini, butang muat turun (CSV sejarah, templat guru) menyalin kandungan ke papan klip.

## Struktur

```
src/engine/   enjin tulen TypeScript (boleh dikongsi dengan Cloud Functions)
src/data/     kamus + taburan jubin
src/features/single/   pengawal single player (bot, bantuan, idempotensi)
src/components/ src/screens/   UI React
src/lib/      bunyi Web Audio (disintesis — tiada fail audio berlesen), getaran
tests/unit/   Vitest      tests/e2e/   Playwright
```

## Lesen & sumber

- Fon: Noto Naskh Arabic, Fredoka, Nunito — SIL Open Font License 1.1 (melalui `@fontsource`).
- Bunyi: disintesis secara asal dalam kod (`src/lib/audio.ts`).
- Susun atur papan "Wau Bulan", ikon dan grafik: asal.
- Kamus: disusun untuk projek ini (definisi ditulis sendiri); **perlu semakan guru** sebelum kegunaan rasmi.
