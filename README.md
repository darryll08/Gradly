# Gradly — Peringatan Dini Akademik

Gradly membantu bagian akademik kampus menemukan mahasiswa yang berisiko gagal atau mundur dari aktivitas 28 hari pertama di LMS, lalu menindaklanjutinya sebelum terlambat.

**Demo:** https://gradly-zeta.vercel.app

## Halaman

| Halaman | Untuk | Isi |
|---|---|---|
| `/cerita` | Pengantar | Cerita 28 hari dalam 3D: tanda-tanda risiko dari minggu pertama sampai minggu keempat |
| `/` Ringkasan | Pimpinan | Angka utama, corong intervensi, sebaran mahasiswa, temuan, kapan bertindak |
| `/antrian` Antrian Saya | Konselor | 15 mahasiswa untuk dihubungi hari ini, dibagi rata ke tim |
| `/mahasiswa` Daftar | Konselor | Kelompok alasan, filter, aksi massal per kampanye |
| `/mahasiswa/[id]` Profil | Konselor | Alasan risiko, langkah, aktivitas, jejak akademik, ruang tindak lanjut dengan riwayat |
| `/cek-risiko` | Konselor | Simulasi perubahan kondisi, simpan sebagai rencana tindak lanjut |
| `/anggaran` | Pimpinan | Biaya dan manfaat per jumlah konselor, terapkan ukuran tim ke antrian |
| `/kebijakan` Laporan & Kebijakan | Pimpinan | Laporan tindak lanjut, pemantau keadilan per kelompok ekonomi, rekomendasi, kualitas data |

## Teknologi

Next.js 15, React Three Fiber, Framer Motion, Supabase. Data prediksi sudah tersedia sebagai JSON di `public/data`.

## Menjalankan di komputer

```bash
npm install
npm run dev        # http://localhost:3000
```

## Supabase (tindak lanjut)

1. Buat project Supabase, lalu jalankan `supabase/schema.sql` di SQL Editor.
2. Salin `.env.example` ke `.env.local`, isi Project URL dan publishable key.
3. Tanpa `.env.local`, catatan tindak lanjut disimpan di browser.

Aturan akses di `schema.sql` masih terbuka untuk prototipe. Ganti dengan aturan berbasis login sebelum memakai data mahasiswa asli.

## Deploy

Repo ini terhubung ke Vercel: setiap push ke `main` otomatis memperbarui situs demo. Variabel `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` disimpan di pengaturan proyek Vercel.
