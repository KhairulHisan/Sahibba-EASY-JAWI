# Multiplayer (klien)

- `MultiplayerHome` — CIPTA / SERTAI bilik (kod 4 digit sebagai string), sambung semula.
- `RoomScreen` (`#bilik`) — memuat bilik, memilih paparan: menunggu kelulusan, `Lobby`, `MultiplayerTable`, tamat tempoh, ralat.
- `useRoom` — pendengar Firestore (bilik awam + rak sendiri) dan heartbeat (kehadiran + ofset jam pelayan).
- `api` — panggilan Cloud Functions; tindakan permainan dicuba semula dengan `actionId` yang sama (idempotensi).
- `session` — `roomId`, draf, susunan rak dan kiraan bantuan disimpan setempat (bukan sumber kebenaran).

Pelayan berwibawa: `functions/src/rooms.ts`. Kontrak: `src/multiplayer/protocol.ts`. Deploy: `docs/DEPLOY.md`.
