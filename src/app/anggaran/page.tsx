'use client';
import { useEffect, useMemo, useState } from 'react';
import { useData, type CapacityPoint, type Summary } from '@/lib/data';
import { n, pct, rp } from '@/lib/format';
import { LineChart } from '@/components/charts';
import { motion } from 'framer-motion';
import { Loading, Failed } from '@/components/ui';
import Link from 'next/link';
import { useTim } from '@/lib/tracker';

// Precision / recall at a share of students handled, from the V31 out-of-fold ranking (1% steps, interpolated).
function at(curve: CapacityPoint[], share: number) {
  const x = Math.max(1, Math.min(100, share * 100));
  const lo = curve[Math.floor(x) - 1], hi = curve[Math.min(99, Math.ceil(x) - 1)];
  const t = x - Math.floor(x);
  return { precision: lo.precision + (hi.precision - lo.precision) * t, recall: lo.recall + (hi.recall - lo.recall) * t };
}

export default function Anggaran() {
  const { data: curve, error } = useData<CapacityPoint[]>('capacity');
  const { data: s } = useData<Summary>('summary');
  const [staff, setStaff] = useState(10);
  const [perStaff, setPerStaff] = useState(80);
  const [cost, setCost] = useState(350_000);
  const [value, setValue] = useState(7_500_000);
  const [eff, setEff] = useState(0.2);
  const tim = useTim();
  // start the sliders from the team size already applied to the queue
  useEffect(() => { if (tim.ready) { setStaff(tim.k); setPerStaff(tim.per); } }, [tim.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const applied = tim.k === staff && tim.per === perStaff;
  // wide screens get a taller curve so the one-screen layout fills the space (matches .budget wide CSS)
  const [chartH, setChartH] = useState(230);
  useEffect(() => { setChartH(window.matchMedia('(min-width: 1600px) and (min-height: 850px)').matches ? 240 : 230); }, []);

  const r = useMemo(() => {
    if (!curve || !s) return null;
    const N = s.nTest;
    const k = Math.min(N, staff * perStaff);
    const share = k / N;
    const { precision, recall } = at(curve, share);
    const reached = precision * k;            // students handled who really are at risk
    const atRiskTotal = reached / Math.max(recall, 1e-9);
    const saved = reached * eff;
    const spend = k * cost;
    const benefit = saved * value;
    const breakeven = spend / Math.max(1, reached * value);
    return { k, share, precision, recall, reached, atRiskTotal, saved, spend, benefit, roi: (benefit - spend) / spend, breakeven };
  }, [curve, s, staff, perStaff, cost, value, eff]);

  if (error) return <main className="canvas"><Failed what="kapasitas" /></main>;
  const slider = (id: string, label: string, v: number, set: (x: number) => void, min: number, max: number, step: number, show: string) => (
    <div>
      <label htmlFor={id} className="lbl">{label} <b className="num">{show}</b></label>
      <input id={id} type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  return (
    <main className="canvas budget">
      <div className="budget-head">
        <span className="eyebrow">Simulasi anggaran · per semester</span>
        <h1>Berapa yang bisa ditolong <em>dengan dana yang ada?</em></h1>
      </div>

      <div className="budget-grid">
        <section className="card budget-knobs">
          <span className="eyebrow">Asumsi kampus</span>
          <div className="stack" style={{ gap: 12, marginTop: 14 }}>
            {slider('staff', 'Konselor / dosen PA', staff, setStaff, 1, 80, 1, `${staff} orang`)}
            {slider('per', 'Mahasiswa per konselor', perStaff, setPerStaff, 10, 200, 5, `${perStaff}`)}
            {slider('cost', 'Biaya pendampingan / mhs', cost, setCost, 50_000, 2_000_000, 50_000, rp(cost))}
            {slider('value', 'UKT yang tetap masuk / mhs', value, setValue, 1_000_000, 20_000_000, 500_000, rp(value))}
            {slider('eff', 'Keberhasilan pendampingan', eff, setEff, 0.05, 0.5, 0.01, pct(eff, 0))}
          </div>
          <div className="apply">
            <button className="btn primary" disabled={applied} onClick={() => tim.apply(staff, perStaff)}>
              {applied ? 'Sudah diterapkan' : `Terapkan ${staff} konselor ke antrian`}
            </button>
            <span className="small faint">Berlaku sekarang: {tim.k} konselor × {tim.per} mhs. <Link href="/antrian" style={{ textDecoration: 'underline' }}>Lihat antrian →</Link></span>
          </div>
          <p className="notice" style={{ marginTop: 14 }}>Konselor menangani mahasiswa mulai dari risiko tertinggi. Biaya dan tingkat keberhasilan adalah asumsi yang dapat disesuaikan.</p>
        </section>

        <div className="budget-main">
          <section>
            <span className="eyebrow">01 / Arus mahasiswa</span>
            {r && s ? (
              <div className="funnel">
                <Flow label="Semua mahasiswa" value={s.nTest} of={s.nTest} tone="neutral" />
                <Flow label="Ditangani konselor" value={r.k} of={s.nTest} tone="brand" note={`${pct(r.share, 0)} dari semua`} />
                <Flow label="Yang ditangani memang berisiko" value={r.reached} of={s.nTest} tone="risk" note={`ketepatan ${pct(r.precision, 0)}`} />
                <Flow label="Terselamatkan" value={r.saved} of={s.nTest} tone="safe" note={`${pct(eff, 0)} dari yang berisiko`} />
              </div>
            ) : <Loading h={220} />}
          </section>

          <section>
            <span className="eyebrow">02 / Uang</span>
            {r ? (
              <>
                <div className="funnel">
                  <Flow label="Biaya program" value={r.spend} of={Math.max(r.spend, r.benefit)} tone="neutral" money />
                  <Flow label="UKT yang tetap masuk" value={r.benefit} of={Math.max(r.spend, r.benefit)} tone="safe" money />
                </div>
                <div className="net">
                  <span>Hasil bersih</span>
                  <b className="num" style={{ color: r.benefit >= r.spend ? 'var(--safe)' : 'var(--accent-ink)' }}>{r.benefit - r.spend >= 0 ? '+' : ''}{rp(r.benefit - r.spend)}</b>
                  <span className="muted">Balik modal bila minimal <b className="num" style={{ color: 'var(--text)' }}>{pct(r.breakeven, 1)}</b> yang didampingi bertahan.</span>
                </div>
              </>
            ) : <Loading h={140} />}
          </section>

          <section className="budget-curve">
            <span className="eyebrow">03 / Kurva kapasitas</span>
            {curve && r && s ? (
              <LineChart
                height={chartH}
                xMax={100}
                xTicks={[0, 20, 40, 60, 80, 100]}
                fmtX={(v) => `${v}%`}
                fmtY={(v) => pct(v, 0)}
                series={[
                  { label: 'Mahasiswa berisiko yang terjangkau', main: true, points: [{ x: 0, y: 0 }, ...curve.map((c) => ({ x: c.pct, y: c.recall }))] },
                  { label: 'Ketepatan (yang ditangani memang berisiko)', points: curve.map((c) => ({ x: c.pct, y: c.precision })) },
                ]}
                markers={[{ x: (s.flagged / s.nTest) * 100, label: `Ambang model: ${n(s.flagged)} mhs` }]}
                dot={{ x: r.share * 100, y: r.recall, label: `${n(r.k)} mhs → ${pct(r.recall, 0)} terjangkau` }}
                onPick={(x) => setStaff(Math.min(80, Math.max(1, Math.round(((x / 100) * s.nTest) / perStaff))))}
              />
            ) : <Loading h={230} />}
            <p className="notice" style={{ marginTop: 6 }}>Klik atau geser pada grafik untuk mengubah jumlah konselor.</p>
          </section>
        </div>
      </div>
    </main>
  );
}

// One proportional bar; the width eases to its new share whenever an assumption moves.
function Flow({ label, value, of, tone, note, money }: { label: string; value: number; of: number; tone: 'neutral' | 'brand' | 'risk' | 'safe'; note?: string; money?: boolean }) {
  return (
    <div className="flow">
      <div className="flow-head">
        <span>{label}</span>
        <b className="num">{money ? rp(value) : n(value)}</b>
      </div>
      <div className="flow-track">
        <motion.div className={`flow-fill ${tone}`} initial={false} animate={{ width: `${Math.max(0.4, (value / Math.max(1, of)) * 100)}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      {note && <span className="flow-note">{note}</span>}
    </div>
  );
}
