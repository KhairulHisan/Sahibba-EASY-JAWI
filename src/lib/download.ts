import { toast } from '../components/Toast';

/** True in the self-contained build published as an embedded web page. */
export const EMBEDDED_BUILD = import.meta.env.VITE_EMBEDDED === '1';

/**
 * Save text as a file (no network). In the embedded build, where file
 * downloads are blocked, the text is copied to the clipboard instead.
 */
export function downloadText(filename: string, text: string, mime = 'text/plain') {
  if (EMBEDDED_BUILD) {
    navigator.clipboard
      .writeText(text.replace(/^\uFEFF/, ''))
      .then(() => toast({ tone: 'jade', content: `Kandungan ${filename} disalin ke papan klip.` }))
      .catch(() => toast({ tone: 'coral', content: 'Tidak dapat menyalin. Gunakan versi aplikasi penuh untuk memuat turun fail.' }));
    return;
  }
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
