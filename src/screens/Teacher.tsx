import { useRef, useState } from 'react';
import { Button } from '../components/Button';
import { JawiText } from '../components/JawiText';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmSheet } from '../components/Sheet';
import { coreLexicon } from '../data';
import { csvToRawEntries, jsonToRawEntries, validateImport, type ImportReport } from '../engine/dictionary';
import { randomId } from '../engine/rng';
import { downloadText } from '../lib/download';
import { sanitizeNickname } from '../state/settings';
import { usePacks } from '../state/teacherPacks';
import { FIREBASE_ENABLED } from '../lib/firebase';
import { navigate } from '../state/router';

const TEMPLATE = [
  'jawi,rumi,meaningMs,category,difficulty,example',
  'کنچيل,kancil,Haiwan kecil yang cerdik dalam cerita rakyat,haiwan,1,Sang Kancil sangat bijak.',
  'پاسير,pasir,Contoh baris ditolak: huruf پ bukan ڤ,alam,1,',
].join('\n');

export function Teacher() {
  const { packs, addPack, togglePack, removePack } = usePacks();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const check = () => {
    setParseError(null);
    try {
      const trimmed = text.trim();
      const raw = trimmed.startsWith('[') || trimmed.startsWith('{') ? jsonToRawEntries(trimmed) : csvToRawEntries(trimmed);
      if (raw.length === 0) throw new Error('Tiada baris data ditemui. Pastikan baris pertama ialah pengepala.');
      setReport(validateImport(raw, { pack: sanitizeNickname(name || 'Pek Guru'), existing: coreLexicon(), idPrefix: randomId('pk') }));
    } catch (e) {
      setReport(null);
      setParseError(e instanceof Error ? e.message : 'Fail tidak dapat dibaca.');
    }
  };

  const save = () => {
    if (!report || report.accepted.length === 0) return;
    const packName = sanitizeNickname(name || 'Pek Guru');
    addPack({ id: randomId('pack-'), name: packName, enabled: true, createdAt: Date.now(), entries: report.accepted.map((e) => ({ ...e, pack: packName })) });
    setReport(null);
    setText('');
    setName('');
  };

  return (
    <div className="app-bg min-h-full overflow-y-auto" data-testid="teacher">
      <ScreenHeader title="Mod Guru" />
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-10">
        <section className="card grid gap-3 p-4">
          <h2 className="font-display text-lg font-semibold">Import pek perkataan (CSV / JSON)</h2>
          <p className="text-sm text-ink-soft">
            Lajur: <code>jawi, rumi, meaningMs, category, difficulty (1–3), example</code>. Setiap baris disemak: ejaan dinormalkan (cth. ك → ک, گ → ݢ), huruf
            yang tiada dalam set jubin ditolak dengan cadangan, pendua dan perkataan sedia ada diabaikan. Anda sebagai guru menjadi penyemak pek ini.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button tone="cream" icon="download" onClick={() => downloadText('templat-pek-easy-jawi.csv', '﻿' + TEMPLATE, 'text/csv')}>
              Muat turun templat
            </Button>
            <Button tone="cream" icon="upload" onClick={() => file.current?.click()}>
              Pilih fail
            </Button>
            <input
              ref={file}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
                e.target.value = '';
              }}
            />
          </div>
          <label className="grid gap-1">
            <span className="font-semibold">Nama pek</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="cth. D2 Haiwan" className="min-h-11 rounded-xl border-2 border-cream-300 bg-white px-3" />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">Kandungan</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={TEMPLATE}
              className="rounded-xl border-2 border-cream-300 bg-white p-3 font-mono text-sm"
              data-testid="teacher-input"
            />
          </label>
          <Button tone="navy" icon="check" disabled={!text.trim()} onClick={check} data-testid="teacher-check">
            Semak
          </Button>
          {parseError && <p className="rounded-xl bg-coral-100 px-3 py-2 font-semibold text-coral-700">{parseError}</p>}
        </section>

        {report && (
          <section className="card grid gap-3 p-4" aria-live="polite" data-testid="teacher-report">
            <h2 className="font-display text-lg font-semibold">
              Laporan semakan: {report.accepted.length}/{report.totalRows} diterima
            </h2>
            {report.issues.length > 0 && (
              <ul className="grid max-h-60 gap-1 overflow-y-auto text-sm">
                {report.issues.map((i, n) => (
                  <li key={n} className={`rounded-lg px-2 py-1 ${i.level === 'error' ? 'bg-coral-100 text-coral-700' : 'bg-mango-100'}`}>
                    {i.level === 'error' ? '✗' : '!'} Baris {i.row}: {i.message}
                  </li>
                ))}
              </ul>
            )}
            {report.accepted.length > 0 && (
              <div className="flex flex-wrap gap-2" dir="rtl">
                {report.accepted.map((e) => (
                  <span key={e.id} className="rounded-xl bg-jade-100 px-2 py-1">
                    <JawiText text={e.jawi} className="text-xl font-bold" /> <span dir="ltr" className="text-xs">({e.rumi})</span>
                  </span>
                ))}
              </div>
            )}
            <Button tone="jade" icon="check" disabled={report.accepted.length === 0} onClick={save} data-testid="teacher-save">
              Simpan & aktifkan pek
            </Button>
          </section>
        )}

        <section className="card grid gap-2 p-4">
          <h2 className="font-display text-lg font-semibold">Pek tersimpan</h2>
          {packs.length === 0 && <p className="text-sm text-ink-soft">Belum ada pek. Pek disimpan pada peranti ini sahaja.</p>}
          {packs.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-2 ring-cream-300">
              <span className="flex-1">
                <span className="block font-bold">{p.name}</span>
                <span className="text-xs text-ink-soft">{p.entries.length} perkataan · berkuat kuasa untuk permainan baharu</span>
              </span>
              <button type="button" role="switch" aria-checked={p.enabled} onClick={() => togglePack(p.id)} className={`min-h-11 rounded-full px-3 text-sm font-bold ${p.enabled ? 'bg-jade-500 text-white' : 'bg-cream-200'}`}>
                {p.enabled ? 'Aktif' : 'Tidak aktif'}
              </button>
              <button type="button" onClick={() => downloadText(`${p.name}.json`, JSON.stringify({ entries: p.entries }, null, 1), 'application/json')} className="min-h-11 rounded-full px-3 text-sm font-bold hover:bg-cream-200">
                Eksport
              </button>
              <button type="button" onClick={() => setDel(p.id)} className="min-h-11 rounded-full px-3 text-sm font-bold text-coral-700 hover:bg-coral-100">
                Padam
              </button>
            </div>
          ))}
        </section>

        {FIREBASE_ENABLED && (
          <section className="card grid gap-2 p-4">
            <h2 className="font-display text-lg font-semibold">Kamus Online Pintar</h2>
            <p className="text-sm text-ink-soft">
              Semak perkataan yang dicadangkan oleh pemain, luluskan atau tolak dengan bukti rujukan, dan urus kamus online pusat. Perlukan akaun Google
              yang didaftarkan sebagai pentadbir.
            </p>
            <Button tone="navy" icon="book" onClick={() => navigate('pentadbir')} data-testid="open-dictionary-admin">
              Pentadbir Kamus Online
            </Button>
          </section>
        )}
      </main>
      <ConfirmSheet
        open={!!del}
        title="Padam pek?"
        message="Perkataan dalam pek ini tidak lagi diterima dalam permainan baharu."
        confirmLabel="Padam"
        onCancel={() => setDel(null)}
        onConfirm={() => {
          if (del) removePack(del);
          setDel(null);
        }}
      />
    </div>
  );
}
