# Semakan Kamus EASY JAWI

Fail dalam folder ini disediakan untuk menyemak ejaan Jawi dan makna **1,375 perkataan** dalam kamus permulaan EASY JAWI (`src/data/jawi-lexicon.json`). Semua perkataan **belum disemak oleh guru**.

## Status semakan

| Pusingan | Tarikh | Hasil |
|---|---|---|
| Semakan AI (ChatGPT), dinilai semula oleh Claude | 2026-11-16 | 1,291 BETUL · **9 ejaan dibetulkan** · 23 makna dikemas kini · **75 RAGU** (perlu guru). Rekod: `hasil/semakan-ai-chatgpt-2026-11-16.csv`, keputusan: `hasil/keputusan-2026-11-16.json` |
| Pengesahan guru | — | Belum. Mulakan dengan **`untuk-guru.csv`** (84 perkataan: 9 yang dibetulkan + 75 RAGU). |

Semakan baharu digunakan dengan `npm run lexicon:apply-review -- <fail.csv> [keputusan.json]`.

## Fail

| Fail | Isi |
|---|---|
| `senarai-semakan-kamus.csv` | Semua 1,375 perkataan, disusun mengikut keutamaan semakan |
| `bahagian/bahagian-01.csv` … `bahagian-07.csv` | Senarai yang sama dipecah 200 baris setiap fail (lebih tepat apabila disemak oleh AI) |
| `ejawimakmur/rumi-01.txt` … `rumi-07.txt` | Perkataan Rumi sahaja (susunan sama) untuk ditampal ke penukar eJawiMakmur |

Fail dijana semula dengan `npm run lexicon:export-review`.

## Lajur

| Lajur | Maksud |
|---|---|
| `keutamaan` | **TINGGI** (235): kata berimbuhan, kata pinjaman Arab/Inggeris, ejaan yang penyusun kurang pasti. **SEDERHANA** (566): hamzah, diftong, 'a' di akhir, vokal 'e'. **RENDAH** (574): kata dasar mudah. |
| `sebab_semakan` | Perkara khusus yang perlu diperiksa |
| `jawi`, `rumi`, `makna` | Entri semasa |
| `jenis`, `kata_dasar` | Kata dasar atau berimbuhan (dan kata dasarnya) |
| `status_semakan` | **Isi:** `BETUL`, `SALAH` atau `RAGU` |
| `ejaan_jawi_cadangan` | **Isi** jika `SALAH`: ejaan Jawi yang betul |
| `makna_cadangan` | **Isi** jika makna perlu dibaiki |
| `catatan` | **Isi:** sebab atau rujukan |

## Huruf yang mesti digunakan

ChatGPT dan papan kekunci sering menukar huruf Jawi kepada huruf Arab/Parsi yang kelihatan serupa. Ejaan cadangan mesti menggunakan:

| Bunyi | Guna | Jangan guna |
|---|---|---|
| k | ک (U+06A9) | ك |
| g | ݢ (U+0762) | گ, ڬ |
| p | ڤ (U+06A4) | پ |
| ny | ڽ (U+06BD) | ڼ, ث |
| ng | ڠ (U+06A0) | غ |
| c | چ (U+0686) | — |
| v | ۏ (U+06CF) | ۋ |
| y / i | ي (U+064A) | ی, ى |

Huruf yang salah akan dikesan dan dilipat secara automatik semasa digabungkan semula ke dalam kamus.

---

## Prompt untuk ChatGPT

Muat naik **satu fail bahagian** (cth. `bahagian-01.csv`), kemudian tampal prompt di bawah. Ulang untuk setiap bahagian.

```text
Anda ialah pakar ejaan Jawi Bahasa Melayu Malaysia yang merujuk Pedoman Umum Ejaan Jawi Bahasa Melayu (DBP) dan Daftar Kata Bahasa Melayu Rumi–Sebutan–Jawi.

Fail CSV yang dilampirkan mengandungi perkataan untuk permainan pendidikan murid sekolah rendah. Untuk SETIAP baris:
1. Semak lajur "jawi" ialah ejaan Jawi standard DBP bagi perkataan dalam lajur "rumi". Beri perhatian kepada perkara dalam lajur "sebab_semakan" (imbuhan, huruf yang luluh, hamzah, alif di akhir, vokal e, kata pinjaman).
2. Semak lajur "makna" betul, ringkas dan sesuai untuk kanak-kanak.
3. Isi lajur:
   - status_semakan: BETUL, SALAH atau RAGU
   - ejaan_jawi_cadangan: ejaan yang betul jika SALAH (kosongkan jika BETUL)
   - makna_cadangan: hanya jika makna perlu dibaiki
   - catatan: sebab ringkas atau rujukan
4. Jika anda tidak pasti, tulis RAGU. Jangan meneka.

Peraturan huruf: gunakan ک (bukan ك), ݢ (bukan گ atau ڬ), ڤ (bukan پ), ڽ, ڠ, چ, ۏ dan ي (bukan ی). Jangan tambah baris baharu, jangan ubah lajur lain, kekalkan susunan baris dan lajur "bil" serta "id".

Pulangkan hasilnya sebagai fail CSV yang boleh dimuat turun dengan lajur yang sama. Selepas itu, senaraikan semua baris yang anda tandakan SALAH atau RAGU dalam bentuk jadual ringkas.
```

## Bandingkan dengan eJawiMakmur (MUIP)

[eJawiMakmur](https://play.google.com/store/apps/details?id=my.gov.muip.ejawi) ialah penukar Rumi→Jawi oleh Majlis Ugama Islam dan Adat Resam Melayu Pahang (MUIP) bersama Munsyi Jawi Pahang. Ia tidak menyediakan API awam, jadi EASY JAWI **tidak** disambungkan terus kepadanya. Sebaliknya, gunakan aplikasi atau laman web eJawiMakmur sebagai rujukan kedua:

1. Buka `ejawimakmur/rumi-01.txt` (200 perkataan Rumi, satu sebaris). Salin semua.
2. Tampal ke penukar Rumi→Jawi eJawiMakmur dan salin keseluruhan output Jawi.
3. Simpan output itu sebagai fail teks, cth. `ejawimakmur/output-01.txt`, kemudian jalankan:

   ```bash
   npm run lexicon:compare-ejawi -- 01 docs/semakan/ejawimakmur/output-01.txt
   ```

   Atau hantar sahaja output itu kepada Claude untuk dibandingkan.
4. Hasilnya `ejawimakmur/perbandingan-01.csv`: setiap perkataan ditanda `SAMA` atau `BERBEZA`. Perbezaan huruf yang setara (cth. ك lawan ک) diabaikan.
5. Ulang untuk `rumi-02.txt` hingga `rumi-07.txt`.

Langkah yang sama boleh digunakan dengan penukar lain, contohnya [Penukar Rumi ke Jawi EDUFUSION](https://www.upkklms.com/penukar-jawi.html) (percuma, menyatakan ia menggunakan kamus 67,000+ perkataan). Tampal `rumi-NN.txt` di laman itu, salin output Jawi, dan bandingkan dengan arahan yang sama. Penukar ini hanya digunakan sebagai rujukan semakan; EASY JAWI tidak memanggil pelayannya.

Perkataan `BERBEZA` tidak bermakna EASY JAWI salah, kerana penukar automatik juga boleh tersilap. Bawa senarai perbezaan kepada guru Jawi untuk keputusan muktamad.

## Selepas semakan

1. Kumpulkan fail CSV yang telah diisi.
2. Hantar semula kepada Claude (atau letak dalam `docs/semakan/hasil/`). Claude akan menyemak cadangan, menormalkan huruf dan mengemas kini kamus serta taburan jubin.
3. Ejaan yang ditanda `RAGU`, dan sebarang perbezaan pendapat, sebaiknya disahkan oleh guru Jawi atau melalui Pusat Rujukan Persuratan Melayu DBP (prpm.dbp.gov.my).

> Nota: ChatGPT juga boleh tersilap tentang ejaan Jawi. Anggap hasilnya sebagai semakan pertama, bukan pengesahan muktamad.
