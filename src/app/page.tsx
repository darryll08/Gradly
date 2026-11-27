'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData, type Student, type Summary, type DayPoint, type Shap, type Tier, TIER_LABEL, TIER_HINT, SHAP_GROUP } from '@/lib/data';
import { n, pct } from '@/lib/format';
import { Counter, Loading, Failed, Key } from '@/components/ui';
import { DayBars } from '@/components/charts';
import type { SwarmView } from '@/components/Swarm';
import { useFollowUps, useTim } from '@/lib/tracker';

const Swarm = dynamic(() => import('@/components/Swarm'), { ssr: false, loading: () => <div className="swarm" /> });
const TIERS: Tier[] = ['merah', 'oranye', 'kuning', 'hijau'];
const VIEWS: { v: SwarmView; label: string }[] = [
  { v: 'hari', label: 'Hari terakhir aktif' },
  { v: 'tingkat', label: 'Tingkat risiko' },
  { v: 'modul', label: 'Per modul' },
];

export default function Ringkasan() {
  const { data: students, error: e1 } = useData<Student[]>('students');
  const { data: s, error: e2 } = useData<Summary>('summary');
  const { data: days } = useData<DayPoint[]>('days');
  const { data: shap } = useData<Shap>('shap');
  const [view, setView] = useState<SwarmView>('hari');
  const { rows: follow } = useFollowUps();
  const tim = useTim();

  // counts that link to the list use the same rule as the list: twin accounts are kept apart
  const real = useMemo(() => {
    if (!students) return null;
    const r = students.filter((x) => !x.ghost);
    const tiers: Record<Tier, number> = { merah: 0, oranye: 0, kuning: 0, hijau: 0 };
    r.forEach((x) => tiers[x.tier]++);
    const twinsKritis = students.filter((x) => x.ghost && x.tier === 'merah').length;
    const byMod = [...new Set(students.map((x) => x.mod))].map((m) => {
      const g = students.filter((x) => x.mod === m);
      return { m, share: g.filter((x) => x.pred === 1).length / g.length };
    }).sort((a, b) => b.share - a.share);
    const twinsFlagged = students.filter((x) => x.ghost && x.pred === 1).length;
    return { tiers, twinsKritis, twinsFlagged, vanished: r.filter((x) => x.sig.includes('vanished')).length, byMod, flagged: r.filter((x) => x.pred === 1).length };
  }, [students]);

  // intervention funnel: model output on top, counselor work (live from the follow-up table) below
  const funnel = useMemo(() => {
    if (!students || !real) return null;
    const st = Object.values(follow);
    const touched = st.filter((f) => f.status !== 'belum').length;
    const coached = st.filter((f) => f.status === 'didampingi' || f.status === 'selesai').length;
    const done = st.filter((f) => f.status === 'selesai').length;
    return [
      { label: 'Mahasiswa diamati', v: students.length, href: '/mahasiswa', live: false },
      { label: 'Diperkirakan gagal (tanpa akun kembar)', v: real.flagged, href: '/mahasiswa?pred=1', live: false },
      { label: `Tertampung tim: ${tim.k} konselor × ${tim.per}`, v: Math.min(real.flagged, tim.k * tim.per), href: '/anggaran', live: false },
      { label: 'Sudah dihubungi', v: touched, href: '/mahasiswa?status=dihubungi', live: true },
      { label: 'Dalam pendampingan atau selesai', v: coached, href: '/mahasiswa?status=didampingi', live: true },
      { label: 'Selesai didampingi', v: done, href: '/mahasiswa?status=selesai', live: true },
    ];
  }, [students, real, follow, tim.k, tim.per]);

  if (e1 || e2) return <main className="canvas"><Failed what="ringkasan" /></main>;

  const caption = !real || !s ? '' : view === 'hari'
    ? 'Mahasiswa yang berhenti aktif sebelum hari ke-14 hampir seluruhnya berisiko.'
    : view === 'tingkat'
      ? `${n(real.twinsKritis)} dari ${n(s.tiers.merah)} mahasiswa kritis adalah akun kembar yang datanya perlu diverifikasi.`
      : `Modul ${real.byMod[0].m} memiliki porsi risiko tertinggi (${pct(real.byMod[0].share, 0)}) dan ${real.byMod[real.byMod.length - 1].m} terendah (${pct(real.byMod[real.byMod.length - 1].share, 0)}).`;

  return (
    <main className="canvas">
      <div className="title-row">
        <div>
          <span className="eyebrow">Peringatan dini akademik · data minggu 1–4</span>
          <h1>Siapa yang perlu ditolong,<br /><em>sebelum semester berakhir.</em></h1>
        </div>
        <div className="aside">
          Model membaca jejak 28 hari pertama di LMS, lalu mengurutkan siapa yang paling mungkin gagal atau mundur.
          <br /><Link className="go-link" href="/mahasiswa">Buka daftar prioritas ↗</Link>
        </div>
      </div>

      <div className="stats">
        {s && real ? (
          <>
            <Link className="stat" href="/mahasiswa"><b className="num"><Counter value={s.nTest} /></b><span>mahasiswa diamati</span></Link>
            <Link className="stat" href="/mahasiswa?pred=1"><b className="num risk"><Counter value={s.flagged} /></b><span>diperkirakan gagal, termasuk {n(real.twinsFlagged)} akun kembar</span></Link>
            <Link className="stat" href="/mahasiswa?tier=merah"><b className="num"><Counter value={real.tiers.merah} /></b><span>kritis siap dihubungi ({n(s.tiers.merah)} termasuk {n(real.twinsKritis)} akun kembar)</span></Link>
            <Link className="stat" href="/mahasiswa?sinyal=vanished"><b className="num"><Counter value={real.vanished} /></b><span>menghilang sebelum hari ke-14</span></Link>
            <Link className="stat" href="/mahasiswa?kembar=1"><b className="num"><Counter value={s.ghost} /></b><span>akun kembar, cek data dulu</span></Link>
          </>
        ) : <Loading h={66} />}
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow risk">01 / Intervensi</span>
            <h2>Dari prediksi ke tindakan, minggu ini.</h2>
          </div>
          <div className="tools"><span className="live-dot">Diperbarui otomatis</span></div>
        </div>
        {funnel ? (
          <div className="funnel">
            {funnel.map((f, i) => {
              // model rows scale to all students; counselor rows scale to what the team can hold, so progress stays visible
              const base = f.live ? funnel[2].v : funnel[0].v;
              const prev = f.live ? funnel[2].v : i > 0 ? funnel[i - 1].v : 0;
              return (
                <Link key={f.label} href={f.href} className={`funnel-row${f.live ? ' live' : ''}`}>
                  <span className="funnel-label">{f.label}</span>
                  <span className="funnel-track"><i style={{ width: `${Math.max(0.4, (f.v / Math.max(1, base)) * 100)}%` }} /></span>
                  <b className="num">{n(f.v)}</b>
                  <span className="funnel-conv num faint">{i > 0 && prev > 0 ? `${pct(f.v / prev, f.live && f.v / prev < 0.01 && f.v > 0 ? 1 : 0)} ${f.live ? 'dari yang tertampung' : 'dari atasnya'}` : ''}</span>
                </Link>
              );
            })}
            <p className="notice">Tiga baris hijau bertambah setiap kali konselor mencatat tindakan.</p>
          </div>
        ) : <Loading h={220} />}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">02 / Sebaran</span>
            <h2>Setiap titik adalah satu mahasiswa.</h2>
          </div>
          <div className="tools">
            <div className="seg" role="group" aria-label="Susunan titik">
              {VIEWS.map((x) => <button key={x.v} aria-pressed={view === x.v} onClick={() => setView(x.v)}>{x.label}</button>)}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-bar">
            {view === 'tingkat' ? (
              <span className="legend">
                {TIERS.map((t) => <span key={t}><span className={`pill tier-${t}`}>{TIER_LABEL[t]}</span></span>)}
                <span className="faint">Warna pucat menandai akun kembar.</span>
              </span>
            ) : (
              <Key items={[{ label: 'Diperkirakan gagal atau mundur', color: 'var(--accent-ink)' }, { label: 'Diperkirakan lulus', color: 'var(--brand)' }]} />
            )}
            <span className="right hide-sm">Klik titik untuk membuka profil mahasiswa</span>
          </div>
          {students ? <Swarm students={students} view={view} /> : <div className="swarm" />}
          <div className="panel-foot"><span>{caption}</span><span className="right hide-sm">{n(students?.length ?? 0)} mahasiswa semester berjalan</span></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow risk">03 / Temuan</span>
            <h2>Empat hal yang tidak terlihat sekilas.</h2>
          </div>
        </div>
        {s ? (
          <div className="findings">
            <Finding big={pct(s.insights.lateStart14, 0)} vs={`vs ${pct(s.insights.dayZero, 0)} yang aktif sejak hari pertama`} text="gagal bila baru muncul setelah hari ke-14." />
            <Finding big={pct(s.insights.vanished14, 0)} vs={`dari ${n(s.insights.vanished14N)} kasus angkatan sebelumnya`} text="gagal bila berhenti muncul sebelum hari ke-14." />
            <Finding big={pct(s.insights.highScoreLowActive, 0)} vs={`${n(s.insights.highScoreLowActiveN)} mahasiswa`} text="tetap berisiko walau nilainya 80 ke atas, kalau hanya aktif 5 hari." />
            <Finding big={pct(s.jejakRates.prevNoScore, 0)} vs={`vs ${pct(s.jejakRates.prevScore, 0)} bila sebelumnya dapat nilai`} text="gagal lagi bila percobaan sebelumnya tanpa nilai." />
          </div>
        ) : <Loading h={160} />}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">04 / Cara model menilai</span>
            <h2>Yang paling menggerakkan skor risiko.</h2>
          </div>
        </div>
        {shap ? (
          <div className="drivers">
            {shap.groups.slice(0, 8).map(([k, v], i) => (
              <div key={k} className="driver">
                <em>{String(i + 1).padStart(2, '0')}</em><span>{SHAP_GROUP[k] ?? k}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / shap.groups[0][1]) * 100}%` }} /></div>
              </div>
            ))}
            <p className="notice" style={{ marginTop: 10 }}>Nilai tugas dan modul paling menentukan, sedangkan umur dan jenis kelamin hampir tidak berpengaruh.</p>
          </div>
        ) : <Loading h={200} />}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">05 / Kapan bertindak</span>
            <h2>Dua minggu pertama adalah jendela untuk bertindak.</h2>
          </div>
        </div>
        <div>
          {days ? (
            <DayBars height={240} data={days.map((d) => ({ day: d.day, rate: d.lastRate, n: d.lastN }))} hot={(d) => d <= 14} fmtY={(v) => pct(v, 0)} cliff={14} />
          ) : <Loading />}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">06 / Tindakan</span>
            <h2>Apa yang dilakukan untuk tiap tingkat.</h2>
          </div>
        </div>
        {real ? (
          <div className="findings">
            {TIERS.map((t) => (
              <Link key={t} href={`/mahasiswa?tier=${t}`} className="finding tier-card">
                <span className={`pill tier-${t}`}>{TIER_LABEL[t]}</span>
                <b className="num" style={{ color: 'var(--text)', marginTop: 10 }}>{n(real.tiers[t])}</b>
                <p>{TIER_HINT[t]}</p>
              </Link>
            ))}
          </div>
        ) : <Loading h={140} />}
      </section>
    </main>
  );
}

function Finding({ big, vs, text }: { big: string; vs: string; text: string }) {
  return (
    <div className="finding">
      <b className="num">{big}</b>
      <p>{text}</p>
      <small>{vs}</small>
    </div>
  );
}
