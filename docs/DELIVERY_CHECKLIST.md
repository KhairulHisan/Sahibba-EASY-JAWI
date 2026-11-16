# Senarai Semak Penghantaran — EASY JAWI (Fasa 0–2, 4, 5 sebahagian)

Tarikh: 2026-11-16. Persekitaran ujian: Node 22, Chromium headless (Playwright 1.63), Linux.
**PASS** = ujian automatik lulus (rujukan diberi) atau semakan tangkapan skrin yang dinyatakan. **NOT TESTED** = dilaksana tetapi tidak disahkan. **NOT IMPLEMENTED** = belum dibina.

Keputusan terkini: `npm test` → **67/67 lulus** · `npm run test:e2e` → **59 lulus, 9 dilangkau dengan sengaja** (ujian seret tetikus / papan kekunci hanya pada desktop; permainan penuh UI sekali pada desktop).

## A. Single Player
| Fungsi | Status | Bukti |
|---|---|---|
| Permainan penuh bot MUDAH/SEDERHANA/SUKAR, hanya perkataan kamus sah | PASS | `tests/unit/bot.test.ts` — 2 benih × 3 tahap, setiap langkah disahkan semula oleh `evaluatePlay` |
| Permainan 4 pemain bercampur, markah = log langkah − penalti | PASS | `bot.test.ts` "4-player mixed game" |
| SUKAR mengatasi MUDAH (benih tetap) | PASS | `bot.test.ts` |
| Manusia (UI) lawan MUDAH hingga upacara keputusan | PASS | `gameplay.spec.ts` "a full game…" (desktop) |
| Manusia (UI) lawan SEDERHANA/SUKAR hingga tamat | NOT TESTED | Enjin diuji; aliran UI sama |
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
| Fungsi | Status |
|---|---|
| Kod 4 digit, 2–4 pemain, rak peribadi, pengesahan pelayan, sambung semula, pindah hos | **NOT IMPLEMENTED** (Fasa 3). Reka bentuk: `BLUEPRINT.md §6`. Butang bilik dimatikan dan diterangkan — `screens.spec.ts` menyemak ia `disabled`. |

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
| Pemasa giliran & tamat masa → langkau | NOT TESTED | Dilaksana (`GameScreen.tsx`); tiada ujian masa nyata |
| Bunyi boleh didengar | NOT TESTED | 22 bunyi disintesis; kod dijalankan tanpa ralat, output audio tidak boleh disahkan secara headless |
| Getaran | NOT TESTED | `navigator.vibrate`, boleh dimatikan |
| Kod bilik | NOT IMPLEMENTED | Fasa 3 |

## Perlu tindakan luar
1. **Semakan guru/DBP** untuk ejaan & makna 1,375 entri kamus (terutamanya ~250 kata berimbuhan) dan polisi kanonik huruf (`BLUEPRINT.md §3`).
2. **Projek Firebase** (Auth tanpa nama, Firestore, Functions, Hosting) untuk Fasa 3 — mungkin dikenakan kos.
3. Ujian pada peranti Android/iOS sebenar.
