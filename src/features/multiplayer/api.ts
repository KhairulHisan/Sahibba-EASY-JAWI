import { firebase } from '../../lib/firebase';
import {
  ROOM_ERROR_MESSAGE,
  type ActResult,
  type CreateRoomRequest,
  type GameActionRequest,
  type JoinRoomRequest,
  type RoomErrorReason,
  type RoomSettings,
} from '../../multiplayer/protocol';

export class MpError extends Error {
  constructor(
    message: string,
    readonly reason?: RoomErrorReason,
    readonly engineCode?: string,
    readonly transient = false,
  ) {
    super(message);
  }
}

const TRANSIENT = new Set(['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/unknown']);

function toMpError(e: unknown): MpError {
  const err = e as { code?: string; message?: string; details?: { reason?: RoomErrorReason; engineCode?: string } };
  const reason = err.details?.reason;
  if (reason) return new MpError(err.message || ROOM_ERROR_MESSAGE[reason], reason, err.details?.engineCode);
  if (err.code === 'functions/unauthenticated') return new MpError('Sesi tamat. Muat semula halaman untuk log masuk semula.');
  if (err.code === 'functions/resource-exhausted') return new MpError(ROOM_ERROR_MESSAGE.TERLALU_BANYAK_CUBAAN, 'TERLALU_BANYAK_CUBAAN');
  if (err.code && TRANSIENT.has(err.code)) return new MpError('Tiada sambungan ke pelayan permainan. Semak Internet dan cuba lagi.', undefined, undefined, true);
  return new MpError(err.message || 'Ralat tidak dijangka.');
}

async function call<T>(name: string, data: unknown): Promise<T> {
  const { fns, fn } = await firebase();
  try {
    return (await fn.httpsCallable(fns, name, { timeout: 20_000 })(data)).data as T;
  } catch (e) {
    throw toMpError(e);
  }
}

/**
 * Game actions carry an idempotency key, so a request that timed out can be
 * safely sent again: if the first one did land, the server answers
 * "duplicate" instead of applying it twice.
 */
async function callWithRetry<T>(name: string, data: unknown, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await call<T>(name, data);
    } catch (e) {
      last = e;
      if (!(e instanceof MpError) || !e.transient) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

export const mpApi = {
  createRoom: (req: CreateRoomRequest) => call<{ roomId: string }>('createRoom', req),
  joinRoom: (req: JoinRoomRequest) => call<{ roomId: string; pending: boolean }>('joinRoom', req),
  approveJoin: (roomId: string, uid: string, approve: boolean) => call<{ ok: true }>('approveJoin', { roomId, uid, approve }),
  setReady: (roomId: string, ready: boolean) => call<{ ok: true }>('setReady', { roomId, ready }),
  updateSettings: (roomId: string, settings: RoomSettings) => call<{ ok: true }>('updateSettings', { roomId, settings }),
  startGame: (roomId: string) => call<{ ok: true }>('startGame', { roomId }),
  action: (req: GameActionRequest) => callWithRetry<ActResult>('gameAction', req),
  claimTimeout: (roomId: string, expectedVersion: number) => call<{ ok: true }>('claimTimeout', { roomId, expectedVersion }),
  heartbeat: (roomId: string) => call<{ hostUid: string; status: string; serverNow: number }>('heartbeat', { roomId }),
  leaveRoom: (roomId: string) => call<{ ok: true }>('leaveRoom', { roomId }),
};
