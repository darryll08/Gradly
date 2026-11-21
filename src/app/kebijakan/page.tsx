'use client';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import { useData, type GroupStat, type Modules, type Audit, type Summary, type Signal, type Student } from '@/lib/data';
import { useFollowUps, useTim, useKampanye, assign, KONSELOR } from '@/lib/tracker';
import { n, pct } from '@/lib/format';
import { Loading, Failed, Key } from '@/components/ui';

const GROUP_NAME: Record<string, string> = { F: 'Perempuan', M: 'Laki-laki', N: 'Tanpa disabilitas', Y: 'Dengan disabilitas', '-': 'Tak tercatat', '?': 'Tak diketahui', '0-35': 'Di bawah 35 tahun', '35-55': '35–55 tahun' };
const grow = { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const };
const BANDS: { name: string; has: (imd: string) => boolean }[] = [
  { name: 'IMD 0–30% (termiskin)', has: (v) => ['0-10%', '10-20', '10-20%', '20-30%'].includes(v) },
  { name: 'IMD 30–60%', has: (v) => ['30-40%', '40-50%', '50-60%'].includes(v) },
  { name: 'IMD 60–100% (terkaya)', has: (v) => ['60-70%', '70-80%', '80-90%', '90-100%'].includes(v) },
  { name: 'Tak tercatat', has: (v) => v === '-' || v === '?' },
];

/** Live progress of the follow-up work: fairness of who gets reached, per counselor, per campaign. */
function Laporan() {
  const { data: students } = useData<Student[]>('students');
  const { rows, ready } = useFollowUps();
  const { k, per, ready: timReady } = useTim();
  const camps = useKampanye();
  const r = useMemo(() => {
    if (!students || !ready || !timReady) return null;
    const risk = students.filter((x) => x.pred === 1 && !x.ghost);
    const hit = (x: Student) => (rows[x.id]?.status ?? 'belum') !== 'belum';
    const touched = risk.filter(hit);
    const bands = BANDS.map((b) => {
      const g = risk.filter((x) => b.has(x.imd));
      const t = g.filter(hit).length;
      return { name: b.name, risk: g.length / risk.length, reach: touched.length ? t / touched.length : 0, cover: g.length ? t / g.length : 0 };
    });
    const owner = assign(students, k, rows, per);
    const team = KONSELOR.slice(0, k).map((name) => {
      const mine = risk.filter((x) => owner.get(x.id) === name);
      return { name, n: mine.length, done: mine.filter(hit).length };
    });
    return { risk: risk.length, touched: touched.length, bands, team };
  }, [students, rows, ready, timReady, k, per]);

  if (!r) return <Loading h={300} />;
  const poor = r.bands[0];
  const gap = poor.reach - poor.risk;
  return (
    <>
      <p className="report-lead">
        {r.touched === 0 ? 'Belum ada tindakan tercatat. Laporan ini terisi otomatis begitu konselor mulai bekerja.' : (
          <>Dari <b className="num">{n(r.risk)}</b> mahasiswa berisiko, <b className="num">{n(r.touched)}</b> sudah dihubungi. Wilayah IMD 0–30% adalah <b className="num">{pct(poor.risk, 0)}</b> dari yang berisiko dan <b className="num">{pct(poor.reach, 0)}</b> dari yang sudah dihubungi
            {r.touched < 20 ? <>; terlalu sedikit untuk disimpulkan.</> : gap < -0.05 ? <span className="risk-ink">: masih kurang terjangkau.</span> : gap > 0.05 ? <span className="safe-ink">: sudah diprioritaskan.</span> : <>: sebanding.</>}</>
        )}
      </p>
      <div className="grid g-1-1" style={{ gap: 48, alignItems: 'start' }}>
        <div>
          <span className="lbl">Pemantau keadilan per kelompok ekonomi</span>
          <div className="fair">
            {r.bands.map((b) => (
              <div key={b.name} className="fair-row">
                <span>{b.name}</span>
                <div className="fair-bars">
                  <div className="flow-track"><div className="flow-fill risk" style={{ width: `${b.risk * 100}%` }} /></div>
                  <div className="flow-track"><div className="flow-fill safe" style={{ width: `${b.reach * 100}%` }} /></div>
                </div>
                <span className="fair-num num"><b className="risk-ink">{pct(b.risk, 0)}</b><b className="safe-ink">{pct(b.reach, 0)}</b></span>
              </div>
            ))}
            <Key items={[{ label: 'Porsi dari mahasiswa berisiko', color: 'var(--accent-ink)' }, { label: 'Porsi dari yang sudah dihubungi', color: 'var(--safe)' }]} />
          </div>
        </div>
        <div>
          <span className="lbl">Progres per konselor ({k} konselor, {per} mahasiswa)</span>
          <div className="team">
            {r.team.map((t) => (
              <div key={t.name} className="team-row">
                <span>{t.name}</span>
                <div className="flow-track"><div className="flow-fill safe" style={{ width: `${t.n ? (t.done / t.n) * 100 : 0}%` }} /></div>
                <span className="num small">{n(t.done)} / {n(t.n)}</span>
              </div>
            ))}
          </div>
          {camps.length > 0 && (
            <>
              <span className="lbl" style={{ marginTop: 20 }}>Kampanye massal</span>
              <div className="team">
                {camps.slice(0, 5).map((c) => (
                  <div key={c.nama} className="team-row camp">
                    <span>{c.nama}</span>
                    <span className="num small">{n(c.n)} mahasiswa · {new Date(c.last).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function Kebijakan() {
  const reduce = useReducedMotion();
  const { data: fair, error } = useData<Record<string, GroupStat[]>>('fairness');
  const { data: mods } = useData<Modules>('modules');
  const { data: audit } = useData<Audit>('audit');
  const { data: s } = useData<Summary>('summary');
  const { data: sig } = useData<Record<string, Signal>>('signals');
  if (error) return <main className="canvas"><Failed what="kebijakan" /></main>;

  const imd = fair?.imd ?? [];
  const poorest = imd.find((g) => g.group === '0-10%');
  const richest = imd.find((g) => g.group === '90-100%');
  const pairs = fair ? [
    { name: 'Disabilitas', a: fair.disability.find((g) => g.group === 'Y'), b: fair.disability.find((g) => g.group === 'N') },
    { name: 'Jenis kelamin', a: fair.gender.find((g) => g.group === 'M'), b: fair.gender.find((g) => g.group === 'F') },
    { name: 'Umur', a: fair.age.find((g) => g.group === '0-35'), b: fair.age.find((g) => g.group === '35-55') },
  ] : [];

  return (
    <main className="canvas">
      <div className="title-row">
        <div>
          <span className="eyebrow">Laporan &amp; kebijakan · untuk pimpinan kampus dan pemerintah</span>
          <h1>Bantuan paling dibutuhkan<br /><em>di wilayah termiskin.</em></h1>
        </div>
        <div className="actions no-print"><button className="btn" onClick={() => window.print()}>Cetak / simpan PDF</button></div>
      </div>

      <div className="stats">
        {poorest && richest && sig && s ? (
          <>
            <div className="stat"><b className="num risk">{pct(poorest.prevalence, 0)}</b><span>gagal di wilayah termiskin</span></div>
            <div className="stat"><b className="num">{pct(richest.prevalence, 0)}</b><span>gagal di wilayah terkaya</span></div>
            <div className="stat"><b className="num risk">{pct(sig.nosub.rate, 0)}</b><span>gagal bila tugas pertama tak dikumpulkan</span></div>
            <div className="stat"><b className="num risk">{pct(s.insights.vanished14, 0)}</b><span>gagal bila menghilang sebelum hari ke-14</span></div>
          </>
        ) : <Loading h={66} />}
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow risk">01 / Laporan tindak lanjut</span>
            <h2>Apakah bantuannya sampai ke yang paling membutuhkan?</h2>
          </div>
          <div className="tools"><span className="live-dot">Diperbarui otomatis</span></div>
        </div>
        <Laporan />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow risk">02 / Kesenjangan ekonomi</span>
            <h2>Makin miskin wilayahnya, makin sering gagal.</h2>
          </div>
          <span className="tools faint small">Indeks kemiskinan wilayah (IMD), angkatan sebelumnya</span>
        </div>
        {fair ? (
          <div className="panel imd">
            {imd.map((g, i) => (
              <div key={g.group} className="imd-col">
                <div className="imd-track">
                  <span className="imd-val num">{pct(g.prevalence, 0)}</span>
                  <motion.div className={`imd-bar${g.group === '-' || g.group === '?' ? ' muted' : ''}`}
                    initial={reduce ? false : { height: 0 }} whileInView={{ height: `${g.prevalence * 100}%` }} viewport={{ once: true }}
                    transition={{ ...grow, delay: reduce ? 0 : i * 0.05 }} />
                </div>
                <span className="imd-name">{i === 0 ? 'Termiskin' : g.group === '90-100%' ? 'Terkaya' : GROUP_NAME[g.group] ?? g.group}</span>
                <span className={`imd-rec num${g.recall < 0.72 ? ' low' : ''}`} title="Bagian mahasiswa berisiko yang ditemukan model">{pct(g.recall, 0)}</span>
              </div>
            ))}
            <p className="imd-note">Angka di bawah tiap kolom menunjukkan porsi mahasiswa berisiko yang berhasil dikenali; angka merah perlu verifikasi manual.</p>
          </div>
        ) : <Loading h={320} />}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">03 / Rekomendasi</span>
            <h2>Empat langkah yang bisa dimulai semester ini.</h2>
          </div>
        </div>
        <div className="recs">
          <Rec no="01" title="Pemicu otomatis tugas pertama" text={`Begitu batas lewat tanpa kiriman, LMS memberi tahu dosen PA. ${sig ? pct(sig.nosub.rate, 0) : '…'} dari kasus ini gagal.`} />
          <Rec no="02" title="Kontak sebelum hari ke-14" text={`Yang menghilang sebelum hari ke-14, ${s ? pct(s.insights.vanished14, 0) : '…'} gagal. Telepon, bukan email.`} />
          <Rec no="03" title="Bantuan ke IMD 0–30%" text="Beasiswa dan pendampingan diarahkan ke wilayah dengan risiko tertinggi." />
          <Rec no="04" title="Uji lewat percontohan" text="Dampingi separuh mahasiswa kritis di 2 modul paling berisiko, bandingkan dengan separuh lainnya." />
        </div>
      </section>

      <div className="grid g-1-1" style={{ gap: 48, alignItems: 'start' }}>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">04 / Kelompok lain</span>
              <h2>Siapa yang lebih sering gagal.</h2>
            </div>
          </div>
          {fair ? (
            <div className="pairs">
              {pairs.map((p) => p.a && p.b && (
                <div key={p.name} className="pair">
                  <span className="eyebrow" style={{ color: 'var(--muted)' }}>{p.name}</span>
                  {[p.a, p.b].map((g, k) => (
                    <div key={g.group} className="pair-row">
                      <span>{GROUP_NAME[g.group] ?? `Umur ${g.group}`}</span>
                      <div className="flow-track"><motion.div className={`flow-fill ${k === 0 ? 'risk' : 'neutral'}`} initial={reduce ? false : { width: 0 }} whileInView={{ width: `${g.prevalence * 100}%` }} viewport={{ once: true }} transition={grow} /></div>
                      <b className="num">{pct(g.prevalence, 0)}</b>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : <Loading h={260} />}
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow risk">05 / Kualitas data LMS</span>
              <h2>Yang perlu dibereskan bagian IT.</h2>
            </div>
          </div>
          {audit ? (
            <div className="audit">
              <Link href="/mahasiswa?kembar=1" className="audit-item"><b className="num">{n(audit.ghostTest)}</b><span>akun kembar: aktivitasnya persis sama. {pct(audit.ghostRate, 0)} dari pola ini gagal. →</span></Link>
              <div className="audit-item"><b className="num">{pct(audit.placeholderShare, 0)}</b><span>baris berisi nilai pengganti ({audit.placeholderValues.join(' / ')}), padahal belum dinilai.</span></div>
              <div className="audit-item"><b className="num">{n(audit.unknownModuleRows)}</b><span>mahasiswa di modul {audit.unknownModule}, kode yang tidak ada di data lama.</span></div>
              <div className="audit-item"><b className="num">{audit.spellingVariants.length}</b><span>ejaan berbeda untuk &ldquo;A Level&rdquo;, terhitung dua kali.</span></div>
            </div>
          ) : <Loading h={260} />}
        </section>
      </div>

      {mods && (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">06 / Per modul</span>
              <h2>Semester ini dibanding data lama.</h2>
            </div>
            <Key items={[{ label: 'Diperkirakan gagal semester ini', color: 'var(--accent-ink)' }, { label: 'Tingkat gagal angkatan sebelumnya', color: 'var(--muted)' }]} />
          </div>
          <div className="mods">
            {[...mods.modules].sort((a, b) => b.flagged / b.n - a.flagged / a.n).map((m, i) => (
              <div key={m.mod} className="mod">
                <b>{m.mod}</b>
                <div className="mod-bars">
                  <div className="flow-track"><motion.div className="flow-fill risk" initial={reduce ? false : { width: 0 }} whileInView={{ width: `${(m.flagged / m.n) * 100}%` }} viewport={{ once: true }} transition={{ ...grow, delay: reduce ? 0 : i * 0.05 }} /></div>
                  <div className="flow-track thin"><motion.div className="flow-fill neutral" initial={reduce ? false : { width: 0 }} whileInView={{ width: `${(m.trainRate ?? 0) * 100}%` }} viewport={{ once: true }} transition={{ ...grow, delay: reduce ? 0 : i * 0.05 + 0.1 }} /></div>
                </div>
                <span className="num mod-pct">{pct(m.flagged / m.n, 0)}</span>
                <span className="num faint small">{m.trainRate == null ? 'kode baru' : `dulu ${pct(m.trainRate, 0)}`} · {n(m.n)} mhs</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Rec({ no, title, text }: { no: string; title: string; text: string }) {
  return (
    <div className="rec">
      <span className="rec-no">{no}</span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
