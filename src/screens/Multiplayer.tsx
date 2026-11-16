import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { MultiplayerHome } from '../features/multiplayer/MultiplayerHome';
import { MULTIPLAYER_ENABLED } from '../lib/firebase';
import { navigate } from '../state/router';

export function Multiplayer() {
  return MULTIPLAYER_ENABLED ? <MultiplayerHome /> : <NotConfigured />;
}

/**
 * Honest status page for builds without a Firebase project (e.g. the
 * embedded single-file build). Nothing here pretends to connect.
 */
function NotConfigured() {
  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="multiplayer">
      <ScreenHeader title="Multiplayer" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-10">
        <div className="card flex gap-3 border-mango-500! bg-mango-100! p-4" role="status">
          <Icon name="wifiOff" size={32} className="shrink-0 text-mango-600" />
          <div>
            <h2 className="font-display text-xl font-semibold">Belum disambungkan ke pelayan</h2>
            <p className="mt-1 text-ink-soft">
              Mod berbilang pemain (2–4 peranti) memerlukan pelayan Firebase untuk mengesahkan setiap langkah, menyimpan rak peribadi secara
              rahsia dan menyegerakkan giliran. Binaan ini (cth. pratonton satu fail) <b>tidak disambungkan</b> kepada projek Firebase, jadi
              butang bilik dimatikan.
            </p>
          </div>
        </div>

        <section className="card p-4">
          <h2 className="mb-3 font-display text-lg font-semibold">Apa yang tersedia apabila pelayan disambungkan</h2>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button type="button" disabled className="btn-3d min-h-16 rounded-2xl bg-navy-800 font-display text-lg font-semibold text-white" aria-describedby="mp-why">
              CIPTA BILIK
            </button>
            <button type="button" disabled className="btn-3d min-h-16 rounded-2xl bg-jade-500 font-display text-lg font-semibold text-white" aria-describedby="mp-why">
              SERTAI BILIK
            </button>
          </div>
          <p id="mp-why" className="mb-3 text-sm font-semibold text-coral-700">
            Dimatikan: binaan ini tiada konfigurasi Firebase.
          </p>
          <ul className="grid gap-2 text-sm text-ink-soft">
            <li>• Hos memilih kod bilik <b>4 digit</b> (cth. 0427 — sifar di hadapan dikekalkan), tahap, peraturan dan had giliran.</li>
            <li>• 2–4 pemain menyertai dengan kod + nama panggilan; pemain ke-5 ditolak; hos boleh meluluskan pemain.</li>
            <li>• Status bilik: menunggu · sedia · bermain · tamat · tamat tempoh.</li>
            <li>• Rak setiap pemain kekal rahsia; semua langkah disahkan di pelayan (bukan pelayar).</li>
            <li>• Sambung semula selepas muat semula halaman, pindah hos jika hos tidak aktif.</li>
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-display text-lg font-semibold">Untuk pentadbir / guru</h2>
          <p className="text-sm text-ink-soft">
            Langkah persediaan Firebase (projek, Authentication tanpa nama, Firestore, Cloud Functions, Emulator) dan kos yang mungkin terlibat
            didokumenkan dalam <code>docs/DEPLOY.md</code> repositori ini.
          </p>
        </section>

        <Button tone="jade" size="lg" icon="user" onClick={() => navigate('single')}>
          Main Single Player sekarang
        </Button>
      </main>
    </div>
  );
}
