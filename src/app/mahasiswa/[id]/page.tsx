'use client';
import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useData, type Student, type Signal, type Shap, TIER_HINT, TIER_LABEL, PLAYBOOK, SHAP_GROUP } from '@/lib/data';
import { n, pct, PRES_LABEL } from '@/lib/format';
import { Bar, Loading, Failed, Key } from '@/components/ui';
import { useFollowUps, useAksi, useTim, assign, STATUS_LABEL, AKSI_LABEL, QUICK, type Status } from '@/lib/tracker';

/** First message to the student: names the warning sign, offers help, no model jargon. */
function waText(s: Student): string {
  const why = s.nosub ? 'tugas pertama belum masuk'
    : s.sig.includes('vanished') ? `kamu belum terlihat di LMS sejak hari ke-${s.last}`
    : s.days < 8 ? 'kamu baru aktif beberapa hari di LMS'
    : s.score != null && s.score < 60 ? 'nilai tugas pertamamu masih bisa dinaikkan'
    : 'kami ingin memastikan semester ini lancar';
  return `Halo, ini tim akademik ${s.mod}. Kami lihat ${why}. Ada kendala yang bisa kami bantu? Balas pesan ini atau pilih jadwal ngobrol 15 menit minggu ini.`;
}

// Weekly clicks of students who were NOT at risk (train medians) — the reference line in "Aktivitas".
const SAFE_WEEKS = [49, 44, 60, 41];

/** What this student's own data says for each SHAP theme. */
function detail(k: string, s: Student): string {
  switch (k) {
    case 'tugas': return s.nosub ? 'Tugas pertama tidak dikumpulkan sampai batas waktu' : 'Tugas pertama sudah dikumpulkan atau belum jatuh tempo';
    case 'nilai': return s.score != null ? `Nilai tugas rata-rata ${s.score.toFixed(0)}` : 'Belum ada nilai tugas';
    case 'aktif': return `Aktif ${s.days} dari 28 hari · ${n(s.clicks)} klik`;
    case 'waktu': return `Pertama muncul hari ke-${s.first}, terakhir hari ke-${s.last}`;
    case 'modul': return `${s.mod} · ${PRES_LABEL[s.pres]}`;
    case 'pendidikan': return s.edu;
    case 'ekonomi': return `IMD ${s.imd}`;
    case 'beban': return `${s.credits} SKS`;
    case 'riwayat': return s.att > 0 ? `Percobaan ke-${s.att + 1}` : 'Percobaan pertama';
    case 'telat': return 'Selisih waktu kumpul terhadap batas';
    default: return `${s.age} · ${s.region}`;
  }
}

export default function Profil({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const reduce = useReducedMotion();
  const { data: students, error } = useData<Student[]>('students');
  const { data: sig } = useData<Record<string, Signal>>('signals');
  const { data: shap } = useData<Shap>('shap');
  const { rows, save, act, error: saveErr } = useFollowUps();
  const { me, k, per } = useTim();
  const log = useAksi(Number(id));
  const [busy, setBusy] = useState(false);
  const s = useMemo(() => students?.find((x) => x.id === Number(id)), [students, id]);
  // same order as the list: twin accounts are ranked apart, so #1 in the list is #1 here too
  const pool = useMemo(() => (students && s ? students.filter((x) => x.ghost === s.ghost) : []), [students, s]);
  const rank = useMemo(() => (s ? pool.filter((x) => x.p > s.p).length + 1 : 0), [pool, s]);
  const f = s ? rows[s.id] : undefined;
  const [status, setStatus] = useState<Status>('belum');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { setStatus(f?.status ?? 'belum'); setNote(f?.note ?? ''); }, [f]);

  if (error) return <main className="canvas"><Failed what="mahasiswa" /></main>;
  if (!students || !sig) return <main className="canvas"><Loading h={500} /></main>;
  if (!s) return (
    <main className="canvas">
      <div className="title-row"><div><Link className="crumb" href="/mahasiswa">← Daftar Mahasiswa</Link><h1>Mahasiswa {id}</h1>
        <p>ID ini tidak ada di data semester berjalan (ID 26092–32593).</p></div></div>
    </main>
  );

  const owner = f?.konselor ?? assign(students, k, rows, per).get(s.id) ?? null;
  const msg = waText(s);
  const actions = [...new Set(s.sig.map((k) => PLAYBOOK[k]).filter(Boolean))].slice(0, 3);
  const maxW = Math.max(...s.weeks, ...SAFE_WEEKS);
  const reasons = shap?.students[s.id] ?? [];
  const maxR = Math.max(0.01, ...reasons.map(([, v]) => Math.abs(v)));
  const up = reasons.filter(([, v]) => v > 0);
  const down = reasons.filter(([, v]) => v < 0);

  return (
    <main className="canvas">
      <div className="title-row">
        <div>
          <Link className="crumb" href="/mahasiswa">← Daftar Mahasiswa</Link>
          <span className={`eyebrow${s.tier === 'hijau' ? '' : ' risk'}`}>{TIER_LABEL[s.tier]} · {TIER_HINT[s.tier]}</span>
          <h1>Mahasiswa {s.id}</h1>
          <p>{s.mod} · {PRES_LABEL[s.pres]} · {s.att > 0 ? `percobaan ke-${s.att + 1}` : 'percobaan pertama'} · {s.credits} SKS</p>
        </div>
        <div className="actions"><Link className="btn" href={`/cek-risiko?dari=${s.id}`}>Simulasikan perubahan</Link></div>
      </div>

      <div className="stats">
        <div className="stat"><b className={`num${s.pred === 1 ? ' risk' : ''}`}>{pct(s.p, 0)}</b><span>peluang gagal atau mundur</span></div>
        <div className="stat"><b className="num">#{n(rank)}</b><span>dari {n(pool.length)} di daftar{s.ghost ? ' akun kembar' : ''}</span></div>
        <div className="stat"><b className="num">{s.days}</b><span>hari aktif dari 28</span></div>
        <div className="stat"><b className="num">{s.score != null ? s.score.toFixed(0) : '–'}</b><span>{s.score != null ? 'nilai tugas rata-rata' : 'belum ada nilai tugas'}</span></div>
      </div>
      {s.ghost && <p className="notice" style={{ marginTop: -30, marginBottom: 36 }}>Pola aktivitas akun ini identik dengan ratusan akun pasif. Verifikasi datanya sebelum menghubungi.</p>}

      <div className="grid g-2-1 profile">
        <div>
          <section className="section">
            <div className="section-head"><div><span className="eyebrow risk">01 / Alasan</span><h2>{up.length >= down.length ? 'Apa yang menaikkan skor mahasiswa ini.' : 'Apa yang menahan dan menaikkan skornya.'}</h2></div></div>
            {!shap ? <Loading h={180} /> : reasons.length === 0 ? (
              <p className="notice">Tidak ada satu faktor yang menonjol; skornya berasal dari gabungan banyak faktor kecil.</p>
            ) : (
              <div className="shap">
                {[...up, ...down].map(([k, v], i) => (
                  <div key={k} className={`shap-row${v < 0 ? ' down' : ''}`}>
                    <div><b>{SHAP_GROUP[k] ?? k}</b><span>{detail(k, s)}</span></div>
                    <div className="shap-track">
                      <motion.i style={{ width: `${(Math.abs(v) / maxR) * 50}%` }} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, delay: i * 0.05 }} />
                    </div>
                    <span className="num">{v > 0 ? 'menaikkan' : 'menahan'}</span>
                  </div>
                ))}
                <p className="notice">Batang ke kanan menaikkan risiko dan batang ke kiri menahannya.</p>
              </div>
            )}
            {s.sig.length > 0 && (
              <div className="rows" style={{ marginTop: 22 }}>
                <div className="lbl" style={{ marginBottom: 0 }}>Tingkat kegagalan mahasiswa dengan tanda yang sama pada angkatan sebelumnya</div>
                {s.sig.map((k) => (
                  <div key={k} className="sig-row">
                    <span>{sig[k].label}</span><Bar value={sig[k].rate} /><b className="num" style={{ textAlign: 'right' }}>{pct(sig[k].rate, 0)} gagal</b>
                  </div>
                ))}
              </div>
            )}
          </section>

          {actions.length > 0 && (
            <section className="section">
              <div className="section-head"><div><span className="eyebrow">02 / Langkah</span><h2>Yang bisa dilakukan minggu ini.</h2></div></div>
              <ol className="steps-list">{actions.map((a) => <li key={a}>{a}</li>)}</ol>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <div><span className="eyebrow">{actions.length > 0 ? '03' : '02'} / Aktivitas</span><h2>Klik per minggu, dibanding yang lulus.</h2></div>
              <div className="tools"><Key items={[{ label: 'Mahasiswa ini', color: 'var(--accent-ink)' }, { label: 'Median mahasiswa yang lulus', color: 'var(--muted)' }]} /></div>
            </div>
            <div className="weeks">
              {s.weeks.map((w, i) => (
                <div key={i}>
                  <div className="weeks-bars">
                    <motion.i title={`${w} klik`} style={{ background: 'var(--accent)', height: `${(w / maxW) * 100}%` }}
                      initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6, delay: i * 0.06 }} />
                    <i title={`${SAFE_WEEKS[i]} klik`} style={{ background: 'var(--neutral)', opacity: 0.5, height: `${(SAFE_WEEKS[i] / maxW) * 100}%` }} />
                  </div>
                  <span className="small faint num">Minggu {i + 1}: {w} dari {SAFE_WEEKS[i]}</span>
                </div>
              ))}
            </div>
            <p className="notice" style={{ marginTop: 12 }}>Pertama aktif pada hari ke-{s.first} dan terakhir pada hari ke-{s.last}.</p>
          </section>
        </div>

        <aside className="side">
          <section className="workspace">
            <span className="eyebrow safe">Ruang tindak lanjut</span>
            <h3>Tangani mahasiswa ini</h3>
            <p className="small muted" style={{ marginBottom: 10 }}>
              {owner ? <>Ditangani <b>{owner}</b></> : <>Belum ada konselor karena di luar kapasitas tim</>}, status <b>{STATUS_LABEL[f?.status ?? 'belum']}</b>.
            </p>
            {f?.rencana && (
              <p className="plan-note small">
                Rencana: risiko <b className="num">{pct(f.rencana.dari, 0)} → {pct(f.rencana.ke, 0)}</b> jika {f.rencana.ubah.join(', ')}.
              </p>
            )}
            {!f?.rencana && (
              <Link className="plan-cta" href={`/cek-risiko?dari=${s.id}`}>
                <span><b>Susun rencana</b><small>Simulasikan perubahan, lalu simpan sebagai target</small></span>
                <i aria-hidden>→</i>
              </Link>
            )}
            <span className="lbl">Pesan templat</span>
            <p className="wa-msg small">{msg}</p>
            <div className="quick">
              {QUICK.map((j) => (
                <button key={j} className={`btn${j === 'wa' ? ' primary' : ''}`} disabled={busy}
                  onClick={async () => { setBusy(true); await act([s.id], j, j === 'wa' ? msg : note, { konselor: me }); setBusy(false); }}>
                  {AKSI_LABEL[j]}
                </button>
              ))}
            </div>
            <span className="lbl" style={{ marginTop: 18 }}>Status</span>
            <div className="chips" role="group" aria-label="Status" style={{ marginBottom: 12 }}>
              {(Object.keys(STATUS_LABEL) as Status[]).map((k) => (
                <button key={k} className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{STATUS_LABEL[k]}</button>
              ))}
            </div>
            <label className="lbl" htmlFor="note">Catatan</label>
            <textarea id="note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. sudah ditelepon, minta perpanjangan tugas 1" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <button className="btn" onClick={async () => { await save(s.id, status, note, me); setSaved(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })); }}>Simpan status</button>
              {saved && <span className="faint small">Tersimpan {saved}</span>}
              {saveErr && <span className="small" style={{ color: 'var(--accent-ink)' }}>Gagal menyimpan ke server: {saveErr}</span>}
            </div>
            <span className="lbl" style={{ marginTop: 18 }}>Riwayat</span>
            {log.length === 0 ? <p className="notice">Belum ada tindakan tercatat.</p> : (
              <ol className="log">
                {log.map((a, i) => (
                  <li key={a.id ?? i}>
                    <b>{AKSI_LABEL[a.jenis] ?? a.jenis}{a.kampanye ? `: ${a.kampanye}` : ''}</b>
                    <span className="faint small num">{new Date(a.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{a.konselor ? `, ${a.konselor}` : ''}</span>
                    {a.catatan && a.jenis !== 'wa' && <span className="small muted">{a.catatan}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section>
            <h3>Jejak akademik</h3>
            {s.jejak ? (
              <>
                <ol className="trail">
                  {s.jejak.map((a, i) => {
                    const me = a.id === s.id;
                    return (
                      <motion.li key={a.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                        <span className={me ? 'me' : a.score == null ? 'empty' : ''} />
                        <div>
                          <b>{PRES_LABEL[a.pres]} · percobaan ke-{a.att + 1}</b>{me && <span className="faint"> · sekarang</span>}
                          <span className="sub">
                            {me ? `Risiko ${pct(s.p, 0)}` : a.score == null ? 'Tidak dapat nilai' : `Nilai ${a.score}`} · aktif {a.days} hari
                            {!me && a.outcome != null && (a.outcome ? ' · akhirnya gagal/mundur' : ' · lulus')}
                          </span>
                        </div>
                      </motion.li>
                    );
                  })}
                </ol>
                <p className="notice">Riwayat dicocokkan dari data pendaftaran pada modul yang sama.</p>
              </>
            ) : <p className="notice">Tidak ada riwayat di modul yang sama pada semester lain.</p>}
          </section>


          <section>
            <h3>Profil</h3>
            <dl className="rows">
              {[['Pendidikan terakhir', s.edu], ['Indeks ekonomi wilayah (IMD)', s.imd], ['Wilayah', s.region], ['Kelompok umur', s.age], ['Disabilitas', s.dis === 'Y' ? 'Ya' : 'Tidak']].map(([k, v]) => (
                <div key={k} style={{ gridTemplateColumns: '1fr auto' }}><dt className="muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
