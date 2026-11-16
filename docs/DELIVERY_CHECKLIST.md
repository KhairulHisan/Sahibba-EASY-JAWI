# Senarai Semak Penghantaran — EASY JAWI (Single Player + Multiplayer)

Tarikh: 2026-11-16. Persekitaran ujian: Node 22, Chromium headless (Playwright 1.63), Linux.
**PASS** = ujian automatik lulus (rujukan diberi) atau semakan tangkapan skrin yang dinyatakan. **NOT TESTED** = dilaksana tetapi tidak disahkan. **NOT IMPLEMENTED** = belum dibina.

Keputusan terkini: `npm test` → **93/93 lulus** · `npm run test:e2e` → **67 lulus, 21 dilangkau dengan sengaja** (seret tetikus / papan kekunci / pemasa / permainan penuh hanya pada projek desktop) · `npm run test:emulator` → **9/9 lulus** · `npm run test:e2e:mp` → **4/4 lulus**.

## A. Single Player
| Fungsi | Status | Bukti |
|---|---|---|
| Permainan penuh bot MUDAH/SEDERHANA/SUKAR, hanya perkataan kamus sah | PASS | `tests/unit/bot.test.ts` — 2 benih × 3 tahap, setiap langkah disahkan semula oleh `evaluatePlay` |
| Permainan 4 pemain bercampur, markah = log langkah − penalti | PASS | `bot.test.ts` "4-player mixed game" |
| SUKAR mengatasi MUDAH (benih tetap) | PASS | `bot.test.ts` |
| Manusia (UI) lawan MUDAH hingga upacara keputusan | PASS | `gameplay.spec.ts` "a full game…" (desktop) |
| Bot SUKAR (Web Worker) hingga upacara keputusan melalui UI | PASS | `gameplay.spec.ts` "SUKAR bot (background worker)…" |
| UI tidak beku semasa bot/bantuan pada CPU 6× perlahan | PASS (manual) | Tugas panjang maks 802 ms → 264 ms selepas Web Worker (ukuran Playwright + CDP) |
| Joker dipindah di papan kekal hurufnya; dialog Escape + perangkap fokus | PASS | `gameplay.spec.ts` |
| Sambung selepas muat semula | PASS | `gameplay.spec.ts` "survives a page refresh" (4 saiz) |
| Main luar talian (service worker) | NOT TESTED | SW dijana (`dist/sw.js`, 51 fail precache); ujian E2E menyekat SW |

## B. Orientasi Jawi
| Fungsi | Status | Bukti |
|---|---|---|
| Mendatar KANAN→KIRI, menegak ATAS→BAWAH, termasuk jubin sedia ada & perkataan silang | PASS | `tests/unit/placement.test.ts` |
| Susunan kiri→kanan ditolak (`وکوب`) | PASS | `placement.test.ts` |
| Tiada pembalikan rentetan; pratonton = rentetan logik | PASS | `gameplay.spec.ts` tap-to-place; `learning.spec.ts` tutorial (`بوکو`, `باتو`) |
| Pembentukan huruf bersambung pada pratonton/kamus | PASS (manual) | Tangkapan skrin Chromium 390px (pratonton `سام`, `بوک`, butiran `ݢاجه`) |
| Pembentukan pada Chrome Android peranti sebenar | NOT TESTED | — |
| Fon meliputi semua huruf jubin | PASS | `screens.spec.ts` `document.fonts.check`; cmap Noto Naskh disemak dengan fontTools |

## C. Penolakan langkah (dengan penjelasan BM)
| Kes | Status | Bukti |
|---|---|---|
| Perkataan tidak dikenali (dinamakan), ruang kosong, tidak bersambung, luar papan, tidak segaris, petak berisi, petak berganda, joker tanpa huruf, jubin bukan milik | PASS | `placement.test.ts` |
| Langkah pertama tidak melalui ★ / terlalu pendek | PASS | `placement.test.ts`; `gameplay.spec.ts` "illegal first move" |
| Salah giliran, versi lapuk, tindakan berganda (tidak boleh skor dua kali) | PASS | `placement.test.ts` "turn, version and idempotency guards" |

## D. Pemarkahan
| Kes | Status | Bukti |
|---|---|---|
| Gandaan huruf/perkataan hanya jubin baharu, sekali | PASS | `score-game.test.ts` |
| Perkataan silang dikira | PASS | `score-game.test.ts` |
| Joker 0 mata tetapi gandaan perkataan berkuat kuasa | PASS | `score-game.test.ts` |
| Bonus 7 jubin (+40, boleh dikonfigurasi) | PASS | `score-game.test.ts` |
| Tukar/langkau, beg hampir kosong, penalti baki sekali, seri juara bersama, menyerah (tiada penalti) | PASS | `score-game.test.ts` |

## E. Multiplayer
Diuji terhadap **Firebase Emulator Suite** (Auth, Firestore, Functions sebenar) — belum pada projek Firebase sebenar.

| Fungsi | Status | Bukti |
|---|---|---|
| Hos cipta kod 4 digit, sifar di hadapan kekal (`0427`, `0007`) sebagai string | PASS | `multiplayer.test.ts` (unit), `functions.test.ts`, `e2e-mp` |
| Kod sedang digunakan ditolak; kod dilepaskan sebaik permainan tamat | PASS | `functions.test.ts`; `e2e-mp` "host approval…", "whole game…" |
| 2–4 pemain sertai; nama sama dijadikan unik (`Ali 2`); pemain ke-5 ditolak; kod salah ditolak | PASS | `e2e-mp` "four devices…" (5 konteks pelayar) |
| Kelulusan hos (lulus / tolak) | PASS | `e2e-mp` "host approval…" |
| Tetapan bilik dilihat semua; tukar tetapan batalkan SEDIA; dikunci selepas MULA | PASS | `e2e-mp`; unit |
| Status menunggu → sedia → bermain → tamat / tamat tempoh | PASS | unit + `e2e-mp` (label status lobi) |
| Hanya hos boleh MULA, hanya apabila semua SEDIA | PASS | `functions.test.ts`; `e2e-mp` |
| Rak peribadi: rak orang lain & `serverState` → `permission-denied`; id jubin tiada dalam dokumen awam | PASS | `functions.test.ts`, `rules.test.ts` |
| Setiap langkah disahkan pelayan; salah giliran ditolak; cubaan semula tidak dikira dua kali | PASS | `functions.test.ts` (`duplicate: true`); unit |
| Papan, markah, beg & giliran segerak pada 4 peranti | PASS | `e2e-mp` "four devices…" |
| Sambung semula selepas muat semula (uid, rak, papan sama) | PASS | `e2e-mp` |
| Langkau, menyerah, keluar = menyerah; pemain lain meneruskan | PASS | `e2e-mp`; unit |
| Pemasa giliran pelayan → langkau automatik (tepat sekali) | PASS | `e2e-mp` "turn timer…" (60 s sebenar) |
| Pindah hos apabila hos terputus > 90 s | PASS (unit) | `multiplayer.test.ts`; tidak diuji dalam pelayar (perlu menunggu 90 s) |
| Pemain terputus > 2 min dilangkau (tanpa pemasa) | PASS (unit) | `multiplayer.test.ts` |
| Keputusan akhir pada semua peranti + disimpan dalam Sejarah | PASS | `e2e-mp` "whole game…" |
| Bilik lama dipadam kekal (rak, log, nama panggilan) | PASS | `multiplayer.test.ts`, `tests/emulator/purge.test.ts` |
| Had kadar cipta/sertai | PASS (unit) | `multiplayer.test.ts` |
| Paparan 360px & 1280px (lobi, meja 4 pemain, keputusan) | PASS (manual) | Tangkapan skrin Chromium |
| Deploy ke projek Firebase sebenar, kependaman rangkaian sebenar, peranti sebenar | NOT TESTED | Perlu projek Firebase pengguna — `docs/DEPLOY.md` |
| App Check | NOT IMPLEMENTED | Disyorkan dalam `DEPLOY.md §5` |
| Main semula dalam bilik yang sama | NOT IMPLEMENTED | Cipta bilik baharu (kod boleh diguna semula serta-merta) |
| Binaan halaman tunggal (artifak) | Multiplayer dimatikan dengan jujur | Tiada konfigurasi Firebase dalam binaan itu |

## F. Responsif & kebolehcapaian
| Fungsi | Status | Bukti |
|---|---|---|
| 360, 390, 768, 1280px tanpa limpahan mendatar | PASS | `screens.spec.ts` (4 projek) |
| Butang tindakan & jubin rak ≥ 44px; papan muat skrin | PASS | `screens.spec.ts` |
| Ketik-untuk-letak pada skrin sentuh (emulasi) | PASS | `gameplay.spec.ts` (`tap()` pada projek sentuh) |
| Seret & lepas tetikus, seret balik ke rak | PASS | `gameplay.spec.ts` (desktop) |
| Zum +/− | PASS | `screens.spec.ts` |
| Zum cubit (pinch) & seret-untuk-pan | NOT TESTED | Dilaksana (`Board.tsx`) |
| Papan kekunci: anak panah + Enter, label `aria` | PASS | `screens.spec.ts` (desktop) |
| Gerakan dikurangkan, bunyi senyap disimpan | PASS | `screens.spec.ts` |
| Nisbah kontras diukur | NOT TESTED | Reka bentuk dakwat gelap atas krim; tiada audit automatik |
| Landskap telefon (844×390) | PASS (manual) | Tangkapan skrin |

## G. Butang & skrin berfungsi
| Fungsi | Status | Bukti |
|---|---|---|
| Tetapan, tutorial, bantuan, susun semula (tarik balik & kocok), tukar, langkau, menyerah, jeda, kembali, kamus, sejarah, keputusan, Mod Guru | PASS | `gameplay.spec.ts`, `learning.spec.ts`, `screens.spec.ts` |
| Pemasa giliran (berasaskan tarikh akhir) & tamat masa → langkau | PASS | `gameplay.spec.ts` "turn timer runs out" (jam palsu Playwright) |
| Bunyi boleh didengar | NOT TESTED | 22 bunyi disintesis; kod dijalankan tanpa ralat, output audio tidak boleh disahkan secara headless |
| Getaran | NOT TESTED | `navigator.vibrate`, boleh dimatikan |

## Perlu tindakan luar
1. **Semakan guru/DBP** untuk ejaan & makna 1,375 entri kamus (terutamanya ~250 kata berimbuhan) dan polisi kanonik huruf (`BLUEPRINT.md §3`).
2. **Projek Firebase anda sendiri** (Auth tanpa nama, Firestore, Functions pada pelan Blaze, Hosting) untuk menghidupkan Multiplayer — ikut `docs/DEPLOY.md`; mungkin dikenakan kos.
3. Ujian pada peranti Android/iOS sebenar.
