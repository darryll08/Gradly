# Sinyal — Peringatan Dini Akademik

Prototipe dashboard finalis DSCO 2026. Skor risiko di Ringkasan, Daftar Mahasiswa, dan Profil berasal dari model V31 (`outputs/results15`, tidak diubah). Halaman Cek Risiko memakai model ringan terpisah (`src/train_live_model.py`).

## Jalankan lokal

```powershell
python src/prepare_web_data.py   # dari folder proyek: data/ + outputs/results15 -> web/public/data
python src/train_live_model.py   # model untuk Cek Risiko
cd web; npm install; npm run dev # http://localhost:3000
```

## Supabase (opsional, untuk Tindak lanjut)

1. Buat project di Supabase, jalankan `supabase/schema.sql` di SQL editor.
2. Salin `.env.example` ke `.env.local`, isi URL dan anon key.
3. Tanpa `.env.local`, status tindak lanjut disimpan di browser.

Kebijakan RLS di `schema.sql` terbuka untuk prototipe. Ganti dengan aturan berbasis login sebelum memakai data mahasiswa asli.

## Deploy ke Vercel

Import repo, set Root Directory = `web`, tambahkan dua variabel `NEXT_PUBLIC_SUPABASE_*` bila memakai Supabase.
