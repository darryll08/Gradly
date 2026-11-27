'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loadLive, type LiveInput, type LiveMeta } from '@/lib/live';
import { load, type Student } from '@/lib/data';
import { pct } from '@/lib/format';
import { Gauge, Bar, Loading } from '@/components/ui';
import { useFollowUps, useTim } from '@/lib/tracker';

type Live = Awaited<ReturnType<typeof loadLive>>;

const START: LiveInput = {
  code_module: 'M03', highest_education: 'A Level', imd_band: '20-30%', age_band: '0-35', gender: 'F', disability: 'N',
  num_of_prev_attempts: 0, studied_credits: 60, registration_days_from_start: -55,
  active_days: 8, week1_interactions: 40, week2_interactions: 25, week3_interactions: 20, week4_interactions: 6,
  first_activity_day: 2, last_activity_day: 20, has_score: 1, no_submission_by_cutoff: 0, avg_score: 62,
};

// Groups of fields a counsellor thinks in; each is reset to the typical value of students who passed.
const LEVERS: { key: string; label: string; fields: string[] }[] = [
  { key: 'submit', label: 'Status tugas pertama', fields: ['has_score', 'no_submission_by_cutoff', 'avg_score'] },
  { key: 'days', label: 'Jumlah hari aktif', fields: ['active_days'] },
  { key: 'weeks', label: 'Aktivitas per minggu', fields: ['week1_interactions', 'week2_interactions', 'week3_interactions', 'week4_interactions'] },
  { key: 'timing', label: 'Kapan mulai & berhenti aktif', fields: ['first_activity_day', 'last_activity_day'] },
  { key: 'repeat', label: 'Riwayat mengulang', fields: ['num_of_prev_attempts'] },
  { key: 'credits', label: 'Beban studi', fields: ['studied_credits'] },
];

function fromStudent(s: Student, ref: Record<string, number>): LiveInput {
  return {
    code_module: s.mod === 'GGG' ? 'M07' : s.mod, highest_education: s.edu, imd_band: s.imd, age_band: s.age, gender: s.gender, disability: s.dis,
    num_of_prev_attempts: s.att, studied_credits: s.credits, registration_days_from_start: ref.registration_days_from_start,
    active_days: s.days, week1_interactions: s.weeks[0], week2_interactions: s.weeks[1], week3_interactions: s.weeks[2], week4_interactions: s.weeks[3],
    first_activity_day: s.first, last_activity_day: s.last, has_score: s.score == null ? 0 : 1, no_submission_by_cutoff: s.nosub ? 1 : 0, avg_score: s.score ?? 70,
  };
}

/** Plain words for what the counselor changed, saved with the plan. */
function changes(a: LiveInput, b: LiveInput): string[] {
  const diff = (fs: string[]) => fs.some((f) => String(a[f]) !== String(b[f]));
  const out: string[] = [];
  if (diff(['has_score', 'no_submission_by_cutoff', 'avg_score'])) out.push(Number(b.has_score) === 1 ? `tugas pertama dikumpulkan (nilai ${b.avg_score})` : 'status tugas pertama berubah');
  if (diff(['active_days'])) out.push(`aktif ${b.active_days} hari`);
  if (diff(['week1_interactions', 'week2_interactions', 'week3_interactions', 'week4_interactions'])) out.push(`klik minggu ke-4 jadi ${b.week4_interactions}`);
  if (diff(['first_activity_day', 'last_activity_day'])) out.push(`tetap aktif sampai hari ke-${b.last_activity_day}`);
  if (diff(['studied_credits'])) out.push(`beban ${b.studied_credits} kredit`);
  return out.length ? out : ['profil diubah'];
}

const STEPS = ['Profil', 'Aktivitas LMS', 'Tugas pertama'];

function Form() {
  const params = useSearchParams();
  const dari = params.get('dari');
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [x, setX] = useState<LiveInput>(START);
  const [base, setBase] = useState<LiveInput>(START);
  const [source, setSource] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const { act, rows } = useFollowUps();
  const { me } = useTim();
  const [planned, setPlanned] = useState(false);

  useEffect(() => { loadLive().then(setLive); }, []);
  useEffect(() => {
    if (!live || !dari) return;
    load<Student[]>('students').then((all) => {
      const s = all.find((r) => r.id === Number(dari));
      if (s) { const v = fromStudent(s, live.meta.reference); setX(v); setBase(v); setSource(`mahasiswa ${s.id}`); }
    });
  }, [live, dari]);

  const p = live ? live.predict(x) : 0;
  const p0 = live ? live.predict(base) : 0;
  const drivers = useMemo(() => {
    if (!live) return [];
    return LEVERS.map((l) => {
      const alt = { ...x };
      l.fields.forEach((f) => { alt[f] = live.meta.reference[f]; });
      return { ...l, delta: p - live.predict(alt) };
    }).sort((a, b) => b.delta - a.delta);
  }, [live, x, p]);

  if (!live) return <Loading h={500} />;
  const meta: LiveMeta = live.meta;
  const setN = (k: string, v: number) => setX((prev) => {
    const next = { ...prev, [k]: v };
    // keep the timeline possible: last >= first, days within the span
    if (k === 'first_activity_day' && Number(next.last_activity_day) < v) next.last_activity_day = v;
    if (k === 'last_activity_day' && Number(next.first_activity_day) > v) next.first_activity_day = v;
    const span = Number(next.last_activity_day) - Number(next.first_activity_day) + 1;
    if (Number(next.active_days) > span) next.active_days = span;
    return next;
  });
  const slider = (k: string, label: string, min: number, max: number, unit = '') => (
    <div>
      <label htmlFor={k}>{label} <b className="num">{x[k]}{unit}</b></label>
      <input id={k} type="range" min={min} max={max} value={Number(x[k])} onChange={(e) => setN(k, Number(e.target.value))} />
    </div>
  );
  const select = (k: string, label: string, names?: Record<string, string>) => (
    <div>
      <label htmlFor={k}>{label}</label>
      <select id={k} className="select" style={{ width: '100%' }} value={String(x[k])} onChange={(e) => setX({ ...x, [k]: e.target.value })}>
        {meta.levels[k].map((v) => <option key={v} value={v}>{names?.[v] ?? v}</option>)}
      </select>
    </div>
  );
  const submitted = Number(x.has_score) === 1;
  const tierOf = (v: number) => (v >= 0.8 ? 'merah' : v >= 0.41 ? 'oranye' : v >= 0.3 ? 'kuning' : 'hijau');
  const changed = Math.abs(p - p0) >= 0.005;

  return (
    <>
      <div className="title-row">
        <div>
          <span className="eyebrow">Cek risiko · simulasi</span>
          <h1>Bagaimana kalau <em>datanya berubah?</em></h1>
          <p>{source
            ? <>Data awal dari {source}. Ubah kondisinya, lalu simpan sebagai rencana tindak lanjut untuk mahasiswa ini.</>
            : <>Coba skenario umum, atau muat data seorang mahasiswa agar hasil simulasinya bisa disimpan sebagai rencana tindak lanjut.</>}</p>
        </div>
        <div className="actions">
          {!dari && (
            <form className="pick" onSubmit={(e) => { e.preventDefault(); if (pick) router.push(`/cek-risiko?dari=${pick}`); }}>
              <input className="field" value={pick} onChange={(e) => setPick(e.target.value.replace(/\D/g, ''))} placeholder="ID mahasiswa" inputMode="numeric" aria-label="ID mahasiswa" />
              <button className="btn primary" type="submit">Muat</button>
            </form>
          )}
          {dari && <Link className="btn" href={`/mahasiswa/${dari}`}>Profil {dari}</Link>}
          <button className="btn" onClick={() => { setX(base); }}>Kembalikan</button>
        </div>
      </div>

      <div className="grid g-2-1" style={{ alignItems: 'start' }}>
        <section className="card">
          {/* three short steps instead of one long form */}
          <div className="steps" role="tablist" aria-label="Langkah">
            {STEPS.map((t, i) => (
              <button key={t} role="tab" aria-selected={step === i} onClick={() => setStep(i)}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>{t}
              </button>
            ))}
          </div>
          {step === 0 && (
            <div className="form-grid">
              {select('code_module', 'Modul')}
              {select('highest_education', 'Pendidikan terakhir', { '-': 'Tak tercatat' })}
              {select('imd_band', 'Indeks ekonomi wilayah (IMD)', { '-': 'Tak tercatat', '?': 'Tak diketahui', '0-10%': '0-10% (termiskin)', '90-100%': '90-100% (terkaya)' })}
              {select('age_band', 'Kelompok umur', { '0-35': 'Di bawah 35', '35-55': '35–55', '55<=': '55 ke atas' })}
              {select('gender', 'Jenis kelamin', { F: 'Perempuan', M: 'Laki-laki' })}
              {select('disability', 'Disabilitas', { N: 'Tidak', Y: 'Ya' })}
              {slider('num_of_prev_attempts', 'Sudah pernah mengambil modul ini', 0, 4, '×')}
              {slider('studied_credits', 'Beban studi', 30, 360, ' kredit')}
            </div>
          )}
          {step === 1 && (
            <div className="form-grid">
              {slider('first_activity_day', 'Pertama aktif di hari ke-', 0, 28)}
              {slider('last_activity_day', 'Terakhir aktif di hari ke-', 0, 28)}
              {slider('active_days', 'Jumlah hari aktif', 1, 28, ' hari')}
              <div />
              {slider('week1_interactions', 'Klik minggu 1', 0, 300)}
              {slider('week2_interactions', 'Klik minggu 2', 0, 300)}
              {slider('week3_interactions', 'Klik minggu 3', 0, 300)}
              {slider('week4_interactions', 'Klik minggu 4', 0, 300)}
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <div className="span-all">
                <span className="lbl">Status tugas pertama</span>
                <div className="seg" role="group" aria-label="Status tugas pertama">
                  <button aria-pressed={submitted} onClick={() => setX({ ...x, has_score: 1, no_submission_by_cutoff: 0 })}>Sudah dinilai</button>
                  <button aria-pressed={!submitted && Number(x.no_submission_by_cutoff) === 0} onClick={() => setX({ ...x, has_score: 0, no_submission_by_cutoff: 0 })}>Belum jatuh tempo</button>
                  <button aria-pressed={!submitted && Number(x.no_submission_by_cutoff) === 1} onClick={() => setX({ ...x, has_score: 0, no_submission_by_cutoff: 1 })}>Tidak dikumpulkan</button>
                </div>
              </div>
              {submitted ? slider('avg_score', 'Nilai', 0, 100) : (
                <p className="notice span-all" style={{ fontSize: 13, lineHeight: '20px' }}>
                  {Number(x.no_submission_by_cutoff) === 1
                    ? 'Tidak ada nilai yang perlu diisi. Tugas yang lewat batas tanpa kiriman adalah tanda risiko terkuat: 94% mahasiswa seperti ini gagal. Lihat skornya di kanan.'
                    : 'Tidak ada nilai yang perlu diisi. Batas tugasnya belum lewat, jadi model hanya memakai aktivitas LMS.'}
                </p>
              )}
            </div>
          )}
          <div className="step-nav">
            {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>← {STEPS[step - 1]}</button>}
            {step < STEPS.length - 1 && <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setStep(step + 1)}>{STEPS[step + 1]} →</button>}
          </div>
        </section>

        <div className="stack" style={{ position: 'sticky', top: 'calc(var(--topbar) + 24px)', alignSelf: 'start' }}>
          <section className="card" style={{ textAlign: 'center' }}>
            <div className="card-head" style={{ justifyContent: 'center' }}><h2>Perkiraan model simulasi</h2></div>
            <Gauge p={p} label={tierOf(p) === 'hijau' ? 'Tidak perlu tindakan' : tierOf(p) === 'kuning' ? 'Pantau tiap minggu' : tierOf(p) === 'oranye' ? 'Masuk pendampingan' : 'Hubungi dalam 48 jam'} />
            <p className="muted num" style={{ marginTop: 6, minHeight: 20 }}>
              {changed ? <>Dari {pct(p0, 0)} menjadi <b style={{ color: 'var(--text)' }}>{pct(p, 0)}</b> ({p < p0 ? '−' : '+'}{Math.abs(Math.round(p * 100) - Math.round(p0 * 100))} poin)</> : 'Geser data di kiri untuk melihat perubahannya'}
            </p>
            <p className="notice" style={{ marginTop: 4 }}>Model simulasi lebih ringkas dari model utama, jadi angkanya bisa sedikit berbeda dari profil. Hasil mengikuti pola angkatan lalu, bukan jaminan.</p>
            {dari && changed && p < p0 && (planned ? (
              <div className="plan-saved">
                <span className="plan-check" aria-hidden>✓</span>
                <div><b>Rencana tersimpan</b><small>Tercatat di riwayat mahasiswa {dari}</small></div>
                <Link className="btn" href={`/mahasiswa/${dari}`}>Buka profil</Link>
              </div>
            ) : (
              <button className="btn primary" style={{ marginTop: 10 }} onClick={async () => {
                const ubah = changes(base, x);
                const ok = await act([Number(dari)], 'rencana', `Target: risiko ${pct(p0, 0)} → ${pct(p, 0)} jika ${ubah.join(', ')}`, { rencana: { dari: p0, ke: p, ubah }, konselor: me, status: rows[Number(dari)]?.status ?? 'belum' });
                setPlanned(!!ok);
              }}>Simpan sebagai rencana untuk {dari}</button>
            ))}
          </section>
          <section className="card">
            <div className="card-head"><h2>Yang paling menaikkan skor</h2></div>
            <div className="rows">
              {drivers.filter((d) => d.delta > 0.01).slice(0, 4).map((d) => (
                <div key={d.key} className="sig-row narrow">
                  <span>{d.label}</span><Bar value={Math.min(1, d.delta / 0.5)} /><b className="num" style={{ textAlign: 'right' }}>+{Math.round(d.delta * 100)}</b>
                </div>
              ))}
              {drivers.filter((d) => d.delta > 0.01).length === 0 && <p className="notice">Tidak ada faktor yang menaikkan skor di atas profil mahasiswa yang lulus.</p>}
            </div>
            <p className="notice" style={{ marginTop: 12 }}>
              Poin menunjukkan perubahan risiko bila faktor tersebut setara dengan mahasiswa yang lulus.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <main className="canvas"><Suspense fallback={<Loading h={500} />}><Form /></Suspense></main>;
}
