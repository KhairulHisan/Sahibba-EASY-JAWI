# Multiplayer — Fasa 3 (belum dilaksana)

Tiada kod rangkaian di sini lagi; skrin `#/multi` memaparkan status jujur.

Rancangan (lihat `docs/BLUEPRINT.md §6`):
- `lib/firebase.ts` — init Auth tanpa nama + Firestore (konfigurasi melalui `VITE_FIREBASE_*`, bukan rahsia).
- `functions/` — Callable `createRoom, joinRoom, approveJoin, setReady, startGame, submitMove, swapTiles, passTurn, resign, reconnect, leaveRoom` + berjadual `closeExpiredRooms`. Setiap satu memanggil `applyAction()` daripada `src/engine/game.ts` di dalam transaksi Firestore dengan `expectedVersion` dan `action.id` (idempotensi).
- `firestore.rules` — tolak secara lalai; `privateHands/{uid}` hanya boleh dibaca pemilik; klien tidak menulis keadaan permainan.
- Ujian Emulator Suite berbilang klien (kod `0427` kekal 4 digit, pemain ke-5 ditolak, cubaan semula tidak skor dua kali).
