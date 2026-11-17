# Deploy EASY JAWI dengan Multiplayer (Firebase)

Single Player tidak memerlukan pelayan. Multiplayer 2–4 peranti memerlukan **projek Firebase anda sendiri**:
Authentication (tanpa nama), Cloud Firestore, Cloud Functions (2nd gen) dan — pilihan — Hosting.

> Cloud Functions hanya tersedia pada pelan **Blaze (bayar ikut guna)**. Kuota percuma Firebase biasanya mencukupi
> untuk penggunaan bilik darjah, tetapi kad pembayaran perlu didaftarkan dan caj boleh berlaku jika penggunaan
> melebihi kuota. Tetapkan **amaran belanjawan** (Google Cloud Console → Billing → Budgets & alerts) sebelum mula.

## 0. Tanpa pelan Blaze — Single Player sahaja (percuma)

Pelan percuma **Spark** tidak membenarkan Cloud Functions, jadi Multiplayer tidak boleh berjalan. Laman web dan
Single Player masih boleh dipasang secara percuma. Gunakan binaan khas yang mematikan butang Multiplayer dengan
jujur (skrin Multiplayer memaparkan "Belum disambungkan ke pelayan"):

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

```bash
npm install
```

```bash
npm run build:single
```

```bash
firebase deploy --only hosting
```

Laman: <https://sahibba-easy-jawi.web.app>. Had Hosting pelan Spark (ditetapkan Google, boleh berubah) termasuk
pindahan data harian; setiap peranti baharu memuat turun ≈1.5 MB sekali (kemudian dicache oleh service worker).
Jika had itu dicapai, laman berhenti dihidangkan sehingga hari berikutnya.

Untuk menghidupkan Multiplayer kemudian: naik taraf ke Blaze, kemudian ikut langkah 1–4 di bawah
(`npm run build`, bukan `build:single`).

## 1. Sediakan projek (sekali sahaja)

1. Cipta projek di <https://console.firebase.google.com> (cth. `easy-jawi-sekolah`).
2. **Authentication** → Sign-in method → aktifkan **Anonymous**. Tiada e-mel atau nama sebenar dikumpul.
3. **Firestore Database** → Create database → mod **production**, lokasi `asia-southeast1` (Singapura) supaya dekat dengan Malaysia.
4. Naik taraf ke pelan **Blaze** (Project settings → Usage and billing).
5. **Project settings → Your apps → Web app** → daftar aplikasi web, salin nilai konfigurasi.

## 2. Konfigurasi binaan

Projek repo ini sudah dikonfigurasi untuk **`sahibba-easy-jawi`**:
- `.env.production` — konfigurasi web app (dibaca oleh `npm run build`).
- `.firebaserc` — `firebase deploy` menyasarkan `sahibba-easy-jawi` secara lalai.

Untuk projek lain, tukar kedua-dua fail itu (atau `firebase use --add`). Nilai konfigurasi web **bukan rahsia** — ia
dihantar kepada setiap pelayar. Keselamatan datang daripada `firestore.rules` (klien hanya boleh membaca bilik dan rak
sendiri) dan Cloud Functions (satu-satunya penulis, mengesahkan setiap langkah). Disyorkan: hadkan API key kepada domain
laman anda (Google Cloud Console → APIs & Services → Credentials → HTTP referrers: `sahibba-easy-jawi.web.app/*`,
`sahibba-easy-jawi.firebaseapp.com/*`, `localhost/*`).

Firebase Analytics **tidak** digunakan (aplikasi untuk kanak-kanak; tiada penjejakan).

## 3. Deploy

Jangan jalankan `firebase init` — `firebase.json`, `firestore.rules`, `firestore.indexes.json` dan `functions/` sudah
disediakan, dan `init` boleh menggantikannya dengan templat kosong.

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

```bash
npm install && npm --prefix functions install
```

```bash
npm run build
```

```bash
firebase deploy --only firestore,functions,hosting
```

Ini memasang: peraturan + indeks Firestore, 11 Cloud Functions di `asia-southeast1` (10 boleh dipanggil +
`closeExpiredRooms` setiap 30 minit), dan laman web daripada `dist/` ke <https://sahibba-easy-jawi.web.app>.
Deploy pertama Functions mengaktifkan beberapa API Google Cloud secara automatik (Cloud Build, Artifact Registry,
Cloud Run, Eventarc, Cloud Scheduler) dan boleh mengambil 5–10 minit. Indeks komposit (`rooms: status + expiresAt`)
mungkin mengambil beberapa minit lagi untuk siap.

Hos lain (Vercel/Netlify) juga boleh digunakan untuk laman web; Firestore dan Functions tetap di Firebase.

## 4. Semak selepas deploy

1. Buka laman pada dua peranti (atau dua tetingkap inkognito).
2. Peranti A: Multiplayer → CIPTA BILIK → kod `0427`. Peranti B: SERTAI BILIK → `0427`.
3. Kedua-dua tekan SEDIA → hos tekan MULA PERMAINAN → mainkan satu langkah, pastikan papan dikemas kini pada kedua-dua peranti.

## 5. Pengesyoran keselamatan

- **App Check** (reCAPTCHA Enterprise / Play Integrity) — mengurangkan panggilan automatik ke Functions. Belum
  diaktifkan dalam kod; aktifkan `enforceAppCheck: true` pada `onCall` selepas mendaftar App Check di konsol.
- Had kadar terbina: 6 bilik dicipta / 10 minit dan 12 cubaan sertai / 10 minit bagi setiap pengguna (cubaan
  kod salah turut dikira). Kod 4 digit **bukan kata laluan** — untuk kelas, aktifkan "Hos meluluskan setiap pemain".
- Tiada sembang, tiada profil awam. Nama panggilan ditapis (huruf/nombor/ruang, maks 16 aksara, senarai kata kasar).

## 6. Data & privasi

| Data | Disimpan di | Tempoh |
|---|---|---|
| Bilik (nama panggilan, markah, papan) | `rooms/{id}` | Bilik tidak aktif tamat tempoh selepas 2 jam; bilik tamat boleh dibaca 24 jam |
| Rak peribadi | `rooms/{id}/hands/{uid}` (pemilik sahaja) | Sama seperti bilik |
| Log langkah | `rooms/{id}/moves` (ahli bilik) | Sama seperti bilik |
| Beg + semua rak | `serverState/{id}` (tiada akses klien) | Sama seperti bilik |
| Semua di atas | — | **Dipadam kekal** oleh `closeExpiredRooms` 24 jam selepas bilik ditutup |
| Kiraan had kadar | `rateLimits/{uid}` | Kekal (kecil; boleh dipadam secara manual) |

Pengguna tanpa nama Firebase Auth kekal dalam projek; padam secara berkala jika perlu (Authentication → Users).

## 7. Anggaran penggunaan

Setiap pemain yang membuka bilik menghantar *heartbeat* setiap 25 saat (1 panggilan Function + 1 tulisan Firestore),
dan setiap tulisan pada dokumen bilik dibaca semula oleh setiap pemain dalam bilik itu.

Contoh kasar — 1 jam, satu bilik 4 pemain: ≈ 600 panggilan heartbeat + ≈ 150 langkah → ≈ 800 panggilan Function,
≈ 800 tulisan dan ≈ 3,200 bacaan Firestore. Kelas 30 murid (8 bilik) selama 1 jam ≈ 6,400 panggilan Function,
≈ 26,000 bacaan Firestore. Bandingkan dengan kuota percuma semasa di halaman harga Firebase sebelum digunakan secara besar-besaran.

## 8. Pembangunan tempatan (tanpa projek sebenar)

Perlu Java 11+ untuk Emulator Suite, dan kebergantungan Functions:

```bash
npm --prefix functions install
```

```bash
npm run emulators
```

Dalam terminal lain:

```bash
VITE_FIREBASE_EMULATOR=1 npm run dev
```

Ujian:

```bash
npm run test:emulator
```

```bash
npm run test:e2e:mp
```

`test:emulator` — peraturan keselamatan + Functions dengan SDK klien sebenar + pemadaman bilik.
`test:e2e:mp` — Playwright berbilang konteks (setiap pemain pelayar berasingan) terhadap binaan dengan emulator.
