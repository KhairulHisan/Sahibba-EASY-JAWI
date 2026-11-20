import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { JawiText } from '../components/JawiText';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sheet } from '../components/Sheet';
import { toast } from '../components/Toast';
import { REJECT_REASONS, dictionaryKey, type RejectReason } from '../dictionary/protocol';
import { adminStatus, decide, listContexts, listEntries, listPending, signInAdmin, signOutAdmin, type AdminStatus, type Entry, type Suggestion } from '../features/dictionary/adminApi';
import { FIREBASE_ENABLED } from '../lib/firebase';

type Tab = 'cadangan' | 'kamus' | 'tambah';
type Draft = { key: string; status: 'verified' | 'rejected' };

const fmt = (t: { toDate?: () => Date } | undefined) => (t?.toDate ? t.toDate().toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Admin review of player suggestions and the central online dictionary. */
export function DictionaryAdmin() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    adminStatus()
      .then(setStatus)
      .catch(() => setError('Tidak dapat menyambung ke pelayan. Semak sambungan Internet.'));
  }, []);
  useEffect(() => {
    if (FIREBASE_ENABLED) refresh();
  }, [refresh]);

  let body;
  if (!FIREBASE_ENABLED) body = <Card icon="wifiOff" title="Tidak tersedia" text="Binaan ini tidak disambungkan ke pelayan Firebase." />;
  else if (error) body = <Card icon="wifiOff" title="Tiada sambungan" text={error} action={<Button onClick={refresh}>Cuba lagi</Button>} />;
  else if (!status) body = <Card icon="timer" title="Memuatkan…" text="Sila tunggu." />;
  else if (status.anonymous)
    body = (
      <Card
        icon="user"
        title="Log masuk pentadbir"
        text="Halaman ini untuk guru / pentadbir yang menyemak perkataan baharu. Log masuk dengan akaun Google anda."
        action={
          <Button
            tone="navy"
            icon="user"
            disabled={busy}
            data-testid="admin-sign-in"
            onClick={() => {
              setBusy(true);
              signInAdmin()
                .then(refresh)
                .catch(() => toast({ tone: 'coral', content: 'Log masuk dibatalkan atau gagal.' }))
                .finally(() => setBusy(false));
            }}
          >
            Log masuk dengan Google
          </Button>
        }
      />
    );
  else if (!status.isAdmin)
    body = (
      <div className="card grid gap-3 p-4" data-testid="admin-not-allowed">
        <h2 className="font-display text-xl font-semibold">Akaun ini belum menjadi pentadbir</h2>
        <p className="text-ink-soft">
          Log masuk sebagai <b>{status.email ?? 'akaun Google'}</b>. Pemilik projek perlu menambah akaun ini sekali sahaja:
        </p>
        <ol className="list-decimal pl-5 text-sm text-ink-soft">
          <li>Firebase console → Firestore Database → <b>Start collection</b> (atau buka koleksi) bernama <code>admins</code></li>
          <li>
            Document ID: <code className="break-all" data-testid="admin-uid">{status.uid}</code>
          </li>
          <li>
            Tambah medan <code>role</code> = <code>admin</code> → Save, kemudian muat semula halaman ini.
          </li>
        </ol>
        <div className="flex gap-2">
          <Button tone="cream" onClick={() => void navigator.clipboard?.writeText(status.uid).then(() => toast({ tone: 'jade', content: 'UID disalin.' }))}>
            Salin UID
          </Button>
          <Button tone="cream" onClick={refresh}>
            Semak semula
          </Button>
          <Button tone="ghost" onClick={() => void signOutAdmin()}>
            Log keluar
          </Button>
        </div>
      </div>
    );
  else body = <AdminConsole status={status} />;

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="dictionary-admin">
      <ScreenHeader title="Pentadbir Kamus Online" />
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-10">{body}</main>
    </div>
  );
}

function Card({ icon, title, text, action }: { icon: Parameters<typeof Icon>[0]['name']; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-4">
      <Icon name={icon} size={32} className="text-navy-700" />
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="text-ink-soft">{text}</p>
      {action}
    </div>
  );
}

function AdminConsole({ status }: { status: AdminStatus }) {
  const [tab, setTab] = useState<Tab>('cadangan');
  const [pending, setPending] = useState<Suggestion[] | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [contexts, setContexts] = useState<Record<string, string[][]>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newWord, setNewWord] = useState('');
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([listPending(), listEntries()])
      .then(([p, e]) => {
        setPending(p);
        setEntries(e);
      })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(load, [load]);

  const newKey = dictionaryKey(newWord);

  return (
    <>
      <div className="card flex items-start gap-3 border-mango-500! bg-mango-100! p-3 text-sm" role="note">
        <Icon name="info" className="mt-0.5 shrink-0 text-mango-600" />
        <p>
          Luluskan perkataan hanya selepas menyemaknya dalam <b>rujukan berautoriti</b> yang anda dibenarkan gunakan (contoh: kamus bercetak). Catat sumber, edisi
          dan bukti (cth. halaman). <b>Jangan</b> gunakan transliterasi AI atau penukar automatik sebagai bukti.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-ink-soft">
        <span>
          Pentadbir: <b>{status.email}</b>
        </span>
        <Button tone="ghost" onClick={() => void signOutAdmin()}>
          Log keluar
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-cream-200 p-1.5" role="tablist">
        {(
          [
            ['cadangan', `Cadangan${pending ? ` (${pending.length})` : ''}`],
            ['kamus', 'Kamus online'],
            ['tambah', 'Tambah'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-xl font-display font-semibold ${tab === id ? 'bg-navy-800 text-white' : 'text-navy-800'}`}
            data-testid={`admin-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError && (
        <p className="rounded-xl bg-coral-100 p-3 font-semibold text-coral-700">
          Gagal memuatkan data. <button className="underline" onClick={load}>Cuba lagi</button>
        </p>
      )}

      {tab === 'cadangan' && (
        <section className="grid gap-2" aria-label="Cadangan pemain">
          {pending === null && <p className="text-ink-soft">Memuatkan…</p>}
          {pending?.length === 0 && <p className="card p-4 text-ink-soft">Tiada cadangan baharu.</p>}
          {pending?.map((s) => (
            <div key={s.key} className="card grid gap-2 p-3" data-testid="admin-suggestion">
              <div className="flex items-center gap-3">
                <JawiText text={s.word} className="text-3xl leading-[1.5] font-bold text-navy-900" />
                <span className="flex-1 text-sm text-ink-soft">
                  {s.count} pemain · terakhir {fmt(s.lastAt as never)}
                </span>
              </div>
              {contexts[s.key] ? (
                <p className="text-xs text-ink-soft">
                  Dimainkan bersama:{' '}
                  {contexts[s.key]!.flat().length ? contexts[s.key]!.map((ws) => ws.join('، ')).join(' | ') : 'tiada perkataan lain'}
                </p>
              ) : (
                <button type="button" className="justify-self-start text-xs font-bold text-navy-700 underline" onClick={() => void listContexts(s.key).then((c) => setContexts((x) => ({ ...x, [s.key]: c })))}>
                  Lihat konteks
                </button>
              )}
              <div className="flex gap-2">
                <Button tone="jade" icon="check" onClick={() => setDraft({ key: s.key, status: 'verified' })} data-testid="admin-approve">
                  Luluskan
                </Button>
                <Button tone="coral" icon="close" onClick={() => setDraft({ key: s.key, status: 'rejected' })} data-testid="admin-reject">
                  Tolak
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'kamus' && (
        <section className="grid gap-2" aria-label="Kamus online">
          {entries === null && <p className="text-ink-soft">Memuatkan…</p>}
          {entries?.length === 0 && <p className="card p-4 text-ink-soft">Kamus online masih kosong.</p>}
          {entries?.map((e) => (
            <div key={e.key} className="card grid gap-1 p-3" data-testid="admin-entry">
              <div className="flex items-center gap-2">
                <JawiText text={e.word} className="text-2xl leading-[1.5] font-bold" />
                {e.rumi && <span className="text-ink-soft">{e.rumi}</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${e.status === 'verified' ? 'bg-jade-500 text-white' : 'bg-coral-500 text-white'}`}>
                  {e.status === 'verified' ? 'SAH' : `DITOLAK · ${REJECT_REASONS[e.reason as RejectReason] ?? e.reason}`}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {e.source.name} ({e.source.version}) · bukti: {e.evidence.note} · semakan #{e.revision} · {fmt(e.updatedAt as never)}
              </p>
              <Button tone="cream" className="justify-self-start" onClick={() => setDraft({ key: e.key, status: e.status === 'verified' ? 'rejected' : 'verified' })}>
                {e.status === 'verified' ? 'Tukar kepada DITOLAK' : 'Tukar kepada SAH'}
              </Button>
            </div>
          ))}
        </section>
      )}

      {tab === 'tambah' && (
        <section className="card grid gap-3 p-4" aria-label="Tambah perkataan">
          <label className="grid gap-1">
            <span className="font-semibold">Perkataan Jawi</span>
            <input dir="rtl" lang="ms-Arab" value={newWord} onChange={(e) => setNewWord(e.target.value)} className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-3 font-jawi text-2xl" data-testid="admin-new-word" />
          </label>
          <p className={`text-sm ${newWord && !newKey ? 'font-bold text-coral-700' : 'text-ink-soft'}`}>
            {!newWord ? 'Taip satu perkataan (2–15 huruf jubin Jawi). Ejaan dinormalkan mengikut peraturan projek.' : newKey ? <>Akan disimpan sebagai: <JawiText text={newKey} className="text-xl font-bold" /></> : 'Bukan satu perkataan huruf jubin Jawi yang sah.'}
          </p>
          <Button tone="jade" disabled={!newKey} onClick={() => newKey && setDraft({ key: newKey, status: 'verified' })}>
            Teruskan
          </Button>
        </section>
      )}

      <DecisionSheet
        draft={draft}
        existing={draft ? entries?.find((e) => e.key === draft.key) : undefined}
        onClose={() => setDraft(null)}
        onDone={() => {
          setDraft(null);
          setNewWord('');
          load();
        }}
      />
    </>
  );
}

function DecisionSheet({ draft, existing, onClose, onDone }: { draft: Draft | null; existing?: Entry; onClose: () => void; onDone: () => void }) {
  const [sourceName, setSourceName] = useState('');
  const [sourceVersion, setSourceVersion] = useState('');
  const [note, setNote] = useState('');
  const [rumi, setRumi] = useState('');
  const [meaning, setMeaning] = useState('');
  const [reason, setReason] = useState<RejectReason>('ejaan-salah');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setSourceName(existing?.source.name ?? '');
    setSourceVersion(existing?.source.version ?? '');
    setNote('');
    setRumi(existing?.rumi ?? '');
    setMeaning(existing?.meaningMs ?? '');
    setReason('ejaan-salah');
  }, [draft, existing]);

  const approve = draft?.status === 'verified';
  const valid = sourceName.trim().length >= 3 && sourceVersion.trim().length >= 1 && note.trim().length >= 3;

  return (
    <Sheet open={!!draft} onClose={onClose} title={approve ? 'Luluskan perkataan' : 'Tolak perkataan'}>
      {draft && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid || saving) return;
            setSaving(true);
            decide({ key: draft.key, status: draft.status, sourceName, sourceVersion, note, rumi, meaningMs: meaning, reason: approve ? undefined : reason })
              .then(() => {
                toast({ tone: 'jade', content: approve ? 'Perkataan diluluskan dan ditambah ke kamus online.' : 'Keputusan ditolak disimpan.' });
                onDone();
              })
              .catch(() => toast({ tone: 'coral', content: 'Gagal disimpan. Pastikan anda pentadbir dan semua medan diisi.' }, 4000))
              .finally(() => setSaving(false));
          }}
        >
          <JawiText text={draft.key} className="text-center text-4xl leading-[1.5] font-bold text-navy-900" />
          {!approve && (
            <label className="grid gap-1">
              <span className="font-semibold">Sebab</span>
              <select value={reason} onChange={(e) => setReason(e.target.value as RejectReason)} className="min-h-11 rounded-xl border-2 border-cream-300 bg-white px-3">
                {Object.entries(REJECT_REASONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Field label="Sumber rujukan *" value={sourceName} onChange={setSourceName} placeholder="cth. Kamus Dewan Edisi Keempat" testId="admin-source" />
          <Field label="Edisi / versi *" value={sourceVersion} onChange={setSourceVersion} placeholder="cth. Edisi 4, 2005" testId="admin-version" max={60} />
          <Field label="Bukti semakan *" value={note} onChange={setNote} placeholder="cth. hlm. 245, entri 'buku'" testId="admin-note" max={500} />
          {approve && (
            <>
              <Field label="Rumi (pilihan)" value={rumi} onChange={setRumi} placeholder="cth. buku" max={60} />
              <Field label="Makna ringkas (pilihan)" value={meaning} onChange={setMeaning} placeholder="Makna untuk murid" max={300} />
            </>
          )}
          <Button type="submit" tone={approve ? 'jade' : 'coral'} disabled={!valid || saving} data-testid="admin-save">
            {saving ? 'Menyimpan…' : approve ? 'Luluskan & tambah ke kamus' : 'Simpan penolakan'}
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function Field({ label, value, onChange, placeholder, testId, max = 120 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; testId?: string; max?: number }) {
  return (
    <label className="grid gap-1">
      <span className="font-semibold">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={max} className="min-h-11 rounded-xl border-2 border-cream-300 bg-white px-3" data-testid={testId} />
    </label>
  );
}
