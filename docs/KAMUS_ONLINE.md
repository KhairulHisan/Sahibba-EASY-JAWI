# Kamus Online Pintar (Smart Online Jawi Dictionary) — Single Player

Status: **dibina dan diuji terhadap Firebase Emulator Suite. BELUM di-deploy.** Tiada penyedia kamus luar
berlesen disambungkan (tiada API yang dibenarkan tersedia) — lihat §8.

## 1. Apa yang berlaku apabila pemain menekan SAHKAN

1. Enjin (`evaluatePlay`) menyemak peraturan susunan dan membina **semua** perkataan yang terbentuk — perkataan utama
   dan perkataan bersilang (mendatar dibaca kanan→kiri, menegak atas→bawah). Ralat susunan diterangkan terus; tiada
   semakan kamus dibuat.
2. Perkataan yang tiada dalam kamus lokal (kamus teras + pek guru) dihantar ke saluran semakan
   (`src/features/dictionary/checker.ts`), mengikut urutan:

| # | Lapisan | Di mana | Hasil |
|---|---|---|---|
| 1 | Kamus lokal | peranti | VALID (sumber `local-teras`) |
| 2 | Cache keputusan berautoriti | peranti, 3 hari | VALID / INVALID terdahulu |
| 3 | **Kamus pusat** `dictionary/{key}` | Firestore (pelan percuma pun boleh) | `verified` → VALID · `rejected` → INVALID |
| 4 | **`validateJawiWordOnline`** (Cloud Function) | pelayan, pelan Blaze sahaja | cache pelayan → adapter penyedia berlesen → VALID / INVALID / NOT_FOUND |
| 5 | Cadangan pemain menunggu | Firestore | PENDING_REVIEW, jika tidak, NOT_FOUND |

3. **Langkah diterima dan diberi markah hanya jika SETIAP perkataan VALID daripada sumber berautoriti**
   (`isAcceptable`: kamus pusat dengan penyemak, sumber dan versi; atau penyedia berlesen; atau kamus lokal). Enjin yang
   sama kemudian menilai semula langkah dari awal dan mengira markah (`preparePlay.ts`).
4. Jika tidak, **tiada apa berubah**: markah, rak, giliran dan jubin di papan kekal. Panel memaparkan keputusan setiap
   perkataan, butang **Cadangkan Perkataan** (NOT_FOUND) dan **Cuba lagi**.

### Status

| Status | Maksud | Diberi markah? |
|---|---|---|
| `VALID` | Disahkan oleh sumber berautoriti (sumber, versi dan bukti disimpan) | Ya |
| `INVALID` | Sumber berautoriti menyatakan ejaan/perkataan tidak diterima (sebab dipaparkan) | Tidak |
| `NOT_FOUND` | Tiada dalam mana-mana sumber yang disemak — **bukan bermaksud ejaan salah** | Tidak (boleh dicadangkan) |
| `PENDING_REVIEW` | Pemain telah mencadangkannya; menunggu pentadbir | Tidak |
| `SERVICE_UNAVAILABLE` | Tiada Internet, tamat masa, had kadar, atau penyedia gagal — **bukan keputusan** | Tidak (Cuba lagi) |

### Masa, cubaan semula, gangguan

- Tamat masa: Firestore 5 s, fungsi 8 s, keseluruhan 12 s; penyedia (di pelayan) 5 s.
- Sewaktu semakan: jubin dikunci, **pemasa giliran dihentikan** (semakan tidak memakan masa pemain), butang Batal tersedia.
- Luar talian dikesan serta-merta (tiada permintaan dihantar). SERVICE_UNAVAILABLE tidak pernah dicache.
- "Cuba lagi" memintas ingatan pendek NOT_FOUND/PENDING (2 minit) — jadi kelulusan pentadbir terus dilihat.
- Permintaan serentak untuk perkataan yang sama dikongsi (satu carian sahaja); ketik dua kali SAHKAN tidak memainkan langkah dua kali.

## 2. Normalisasi

Semua lapisan (peranti, pelayan, peraturan Firestore melalui ID dokumen) menggunakan **satu** fungsi:
`dictionaryKey()` = `normalizeJawi()` projek (NFKC bentuk persembahan, NFC, buang harakat/tatweel/aksara tak
kelihatan, lipat ك→ک, گ/ڬ→ݢ, ی→ي, ھ→ه; hamzah dikekalkan) + mesti 2–15 huruf jubin Jawi. Tiada transliterasi
Rumi→Jawi automatik digunakan sebagai bukti; medan Rumi pentadbir hanyalah maklumat.

## 3. Data Firestore

| Laluan | Kandungan | Baca | Tulis |
|---|---|---|---|
| `dictionary/{key}` | status `verified`/`rejected`, `source {id:'kamus-pusat', name, version}`, `evidence {method:'admin-review', reviewedBy, reviewedAt, note}`, `revision`, rumi/makna pilihan, sebab tolak | pemain log masuk (`get` sahaja) | **pentadbir sahaja**, medan lengkap wajib, `revision` +1 |
| `dictionaryAudit/{id}` | siapa, bila, apa, sumber, nota | pentadbir | pentadbir (tambah sahaja, tiada ubah/padam) |
| `wordSuggestions/{key}` | perkataan, `count`, status `pending/approved/rejected` (tiada nama/ID pemain) | pemain (`get`), pentadbir (senarai) | pemain: cipta / `count+1` sahaja dalam transaksi bersama rekod sendiri + kuota; pentadbir: status |
| `wordSuggestions/{key}/by/{uid}` | masa + perkataan lain dalam langkah itu (≤ 6) | pemilik, pentadbir | pemilik, sekali sahaja |
| `suggestQuota/{uid}` | had: ≥ 5 s antara cadangan, ≤ 20 sehari | pemilik | pemilik (disahkan oleh peraturan) |
| `admins/{uid}` | senarai pentadbir | diri sendiri | **tiada** (dicipta di konsol oleh pemilik projek) |
| `dictionaryCache/{provider__key}` | keputusan penyedia + versi + tamat tempoh | tiada | fungsi (Admin SDK) |
| `dictRateLimits/{uid}` | had fungsi: 60 perkataan/10 min, 400/hari | tiada | fungsi |

Indeks komposit: `wordSuggestions (status ↑, count ↓)` — dalam `firestore.indexes.json`.

Pentadbir = akaun **bukan tanpa nama** (Google) **dan** ada dokumen `admins/{uid}`. Akaun tanpa nama tidak boleh menjadi
pentadbir walaupun disenaraikan (diuji).

## 4. Fungsi `validateJawiWordOnline`

- Kod: `functions/src/dictionary.ts` (logik tulen, diuji dengan `MemoryRepo`), dibalut dalam `functions/src/index.ts`.
- Input `{ words: string[] }` (1–8). Output `{ results: WordCheck[], provider }` dengan sumber, versi dan bukti.
- Urutan: kamus pusat (keputusan pentadbir muktamad) → cache pelayan → penyedia → cadangan menunggu.
- Cache pelayan: VALID/INVALID 30 hari, NOT_FOUND 1 hari, tidak sah apabila versi penyedia berubah. Kegagalan tidak dicache.
- Had kadar setiap pengguna; App Check boleh dikuatkuasakan (`ENFORCE_APP_CHECK=true`).
- **Kunci API penyedia hanya di Secret Manager** (`DICT_PROVIDER_API_KEY`), tidak pernah dihantar kepada klien.

Pemilihan penyedia (`functions/.env.<projek>`):

```
DICT_PROVIDER=none          # lalai — tiada penyedia luar
# DICT_PROVIDER=http        # penyedia berlesen melalui HttpJsonProvider, perlukan:
# DICT_PROVIDER_URL=https://…
# DICT_PROVIDER_ID=nama-penyedia        (a–z, 0–9, -)
# DICT_PROVIDER_NAME=Nama Penyedia
# DICT_PROVIDER_VERSION=edisi/versi data
# DICT_PROVIDER_LICENCE=rujukan perjanjian lesen
# ENFORCE_APP_CHECK=true
```

```bash
firebase functions:secrets:set DICT_PROVIDER_API_KEY
```

Kontrak JSON `HttpJsonProvider` (kontrak **kami**, bukan API mana-mana penyedia — penyedia sebenar mungkin memerlukan
adapter kecil sendiri atau proksi): `POST {"words":[…]}` dengan `Authorization: Bearer <kunci>` →
`{"results":[{"word":"…","status":"VALID|INVALID|NOT_FOUND","reference":"…"}]}`. Jawapan yang cacat, tidak lengkap
atau ralat HTTP **tidak pernah** dianggap VALID.

`DICT_PROVIDER=emulator-fake` ialah data ujian (`functions/src/emulatorFakeProvider.ts`) dan ditolak di luar emulator.

## 5. Menyediakan pentadbir (sekali sahaja)

1. Firebase console → **Authentication → Sign-in method → Google → Enable** (pilih e-mel sokongan) → Save.
2. Buka laman → **Mod Guru → Pentadbir Kamus Online** → *Log masuk dengan Google*.
3. Halaman memaparkan **UID** anda. Di Firebase console → **Firestore Database** → *Start collection* `admins` →
   Document ID = UID itu → medan `role` (string) = `admin` → Save.
4. Tekan *Semak semula*. Tab: **Cadangan** (luluskan/tolak dengan sumber, edisi dan bukti wajib), **Kamus online**
   (senarai + ubah keputusan), **Tambah** (tambah perkataan terus).

## 6. Tetapan pemain

**Tetapan → Kamus Online Pintar** atau **Menu permainan → Kamus Online Pintar: Hidup/Mati**. Mati secara lalai.
Tidak digunakan dalam Multiplayer (pelayan Multiplayer kekal menggunakan kamus teras sahaja). Bot dan bantuan tidak
menggunakan perkataan online.

## 7. Kos berpotensi (anggaran; harga ditetapkan Google dan boleh berubah)

| Tindakan | Pelan Spark (percuma) | Pelan Blaze |
|---|---|---|
| Semak 1 perkataan baharu (tiada cache) | 2 bacaan Firestore | 1 bacaan + 1 panggilan fungsi (+ ±4 bacaan, ≤ 2 tulisan di pelayan) |
| Perkataan yang sudah disahkan (cache peranti) | 0 | 0 |
| Cadangan | 2 bacaan + 3 tulisan | sama |
| Halaman pentadbir dibuka | ≤ 160 bacaan | sama |
| Penyedia luar berlesen | — | **mengikut kontrak penyedia** (di luar Firebase) |

Contoh: 30 murid, setiap seorang 20 perkataan baharu sehari ≈ 1,200 bacaan/hari — jauh di bawah kuota percuma
harian Firestore. Kos utama yang mungkin ialah yuran penyedia kamus berlesen, jika ada.

## 7b. Batasan diketahui

- Keputusan VALID/INVALID dicache pada peranti selama **3 hari**. Jika pentadbir menukar keputusan (cth. tarik balik
  kelulusan), peranti yang sudah menyimpan keputusan lama mengikutnya sehingga cache tamat (atau "Padam semua data").
- Single Player berjalan sepenuhnya pada peranti: pengguna teknikal boleh mengubah `localStorage` (sama seperti
  permainan Single Player sedia ada). Multiplayer tidak terjejas — pelayannya hanya menerima kamus teras.
- Binaan `npm run dev` menggunakan projek sebenar jika Kamus Online dihidupkan; guna `VITE_FIREBASE_EMULATOR=1` untuk ujian.

## 8. Perkara yang masih memerlukan kebenaran / tindakan

1. **Penyedia kamus luar berlesen**: tiada API awam DBP yang kami ketahui boleh digunakan, dan kami **tidak** mereka
   API atau mengikis (scrape) portal DBP / pihak ketiga. Perlu perjanjian lesen bertulis dengan penyedia (cth. DBP atau
   penerbit kamus) yang membenarkan semakan automatik, had kadar, cache dan paparan sumber. Selepas itu: adapter
   khusus (jika kontrak berbeza), `DICT_PROVIDER=http`, rahsia di Secret Manager, deploy.
2. **Sumber rujukan pentadbir**: pentadbir mesti menggunakan rujukan yang mereka berhak rujuk; hak cipta kandungan
   kamus (makna, contoh) — simpan ringkas, jangan salin entri penuh.
3. **App Check**: perlu daftar laman + kunci reCAPTCHA Enterprise sebelum dikuatkuasakan.
4. **Semakan guru** untuk kamus lokal 1,375 perkataan (status masih "belum disahkan guru" — dikekalkan sebagai asas
   permainan seperti sebelum ini; bukan sumber berautoriti).
5. Deploy ke projek sebenar belum dibuat (arahan: `DEPLOY.md`).
