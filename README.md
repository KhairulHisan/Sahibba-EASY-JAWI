# EASY JAWI

> **Susun Huruf, Bina Perkataan, Jadi Juara!**

Permainan papan perkataan Jawi asli (genre Scrabble/Sahibba) untuk murid, guru dan keluarga Malaysia. Jubin ialah huruf Jawi; perkataan mendatar dibaca **kanan → kiri**, menegak **atas → bawah**.

| | Status |
|---|---|
| Single Player (lawan bot MUDAH / SEDERHANA / SUKAR) | ✅ Siap & diuji |
| Enjin peraturan, pemarkahan, kamus, bot | ✅ Siap & diuji (Vitest) |
| UI responsif 360 → 1280px, PWA, bunyi, animasi | ✅ Siap & diuji (Playwright) |
| Tutorial interaktif, Kamus, Sejarah, Mod Guru | ✅ Siap & diuji |
| **Multiplayer 2–4 peranti** (kod bilik 4 digit, rak peribadi, pelayan mengesahkan setiap langkah) | ✅ Siap & diuji terhadap Firebase Emulator (4 pelayar serentak). Perlu **projek Firebase anda sendiri** untuk digunakan — [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Kamus permulaan (1,375 perkataan, termasuk kata berimbuhan) | ⚠️ Disemak AI (9 ejaan dibetulkan); **BELUM DISAHKAN GURU** — lihat `docs/semakan/untuk-guru.csv` |

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

- `npm test` — 93 ujian unit Vitest: normalisasi Unicode Jawi, arah RTL, semua penolakan langkah, pemarkahan, joker, bonus 7 jubin, tamat permainan/seri, idempotensi & versi, kamus, taburan jubin, permainan penuh bot-lawan-bot (3 tahap, 2–4 pemain), logik bilik multiplayer.
- `npm run test:emulator` / `npm run test:e2e:mp` — Multiplayer terhadap Firebase Emulator Suite (perlu Java 11+ dan `npm --prefix functions install`). Lihat [`docs/DEPLOY.md`](docs/DEPLOY.md).
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

## Bina & deploy

Multiplayer: ikut [`docs/DEPLOY.md`](docs/DEPLOY.md) (perlu pelan Blaze). Tanpa Blaze: `npm run build:single` + `firebase deploy --only hosting` — Single Player penuh, butang Multiplayer dimatikan dengan jujur.

### Single Player sahaja (tiada pelayan diperlukan)

```bash
npm run build
```

Output statik dalam `dist/` (termasuk service worker PWA). Contoh hos:

```bash
npx firebase-tools deploy --only hosting
```

(`firebase.json` disediakan; perlu projek Firebase anda sendiri.) Vercel/Netlify: arahan binaan `npm run build`, direktori output `dist`. Laluan menggunakan `#hash`, jadi tiada peraturan rewrite diperlukan. Pengehosan mungkin dikenakan kos oleh penyedia.

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
src/features/multiplayer/  skrin bilik, lobi, meja permainan berbilang pemain
src/multiplayer/  kontrak klien/pelayan      functions/   Cloud Functions (pelayan berwibawa)
src/components/ src/screens/   UI React
src/lib/      bunyi Web Audio (disintesis — tiada fail audio berlesen), getaran
tests/unit/   Vitest      tests/e2e/   Playwright      tests/emulator/ tests/e2e-mp/   Multiplayer
```

## Lesen & sumber

- Fon: Noto Naskh Arabic, Fredoka, Nunito — SIL Open Font License 1.1 (melalui `@fontsource`).
- Bunyi: disintesis secara asal dalam kod (`src/lib/audio.ts`).
- Susun atur papan "Wau Bulan", ikon dan grafik: asal.
- Kamus: disusun untuk projek ini (definisi ditulis sendiri); **perlu semakan guru** sebelum kegunaan rasmi.
