'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useData, type Student, type Signal, PLAYBOOK } from '@/lib/data';
import { n, pct, PRES_LABEL } from '@/lib/format';
import { TierPill, Loading, Failed } from '@/components/ui';
import { useFollowUps, useTim, assign, KONSELOR, DAILY, STATUS_LABEL, type Status } from '@/lib/tracker';

const OPEN: Status[] = ['dihubungi', 'didampingi'];

export default function Antrian() {
  const { data: students, error } = useData<Student[]>('students');
  const { data: sig } = useData<Record<string, Signal>>('signals');
  const { rows, ready, act } = useFollowUps();
  const { me, setMe, k, per, ready: timReady } = useTim();
  const [busy, setBusy] = useState<number | null>(null);

  const mine = useMemo(() => {
    if (!students) return [];
    const owner = assign(students, k, rows, per);
    return students.filter((s) => owner.get(s.id) === me).sort((a, b) => b.p - a.p);
  }, [students, k, per, rows, me]);
  const waiting = students ? Math.max(0, students.filter((s) => s.pred === 1 && !s.ghost).length - k * per) : 0;

  if (error) return <main className="canvas"><Failed what="mahasiswa" /></main>;
  if (!students || !sig || !ready || !timReady) return <main className="canvas"><Loading h={500} /></main>;

  const st = (s: Student) => rows[s.id]?.status ?? 'belum';
  const today = mine.filter((s) => st(s) === 'belum').slice(0, DAILY);
  const open = mine.filter((s) => OPEN.includes(st(s)));
  const done = mine.filter((s) => st(s) === 'selesai').length;
  const touched = mine.length - mine.filter((s) => st(s) === 'belum').length;
  const team = KONSELOR.slice(0, k);
  const why = (s: Student) => (s.sig[0] && sig[s.sig[0]] ? sig[s.sig[0]].label : 'Gabungan banyak faktor kecil');

  return (
    <main className="canvas">
      <div className="title-row">
        <div>
          <span className="eyebrow">Antrian hari ini</span>
          <h1>{n(today.length)} mahasiswa untuk dihubungi <em>hari ini.</em></h1>
          <p>Mahasiswa berisiko dibagi rata ke {k} konselor × {per} mahasiswa, dari risiko tertinggi. Ukuran tim mengikuti <Link href="/anggaran" style={{ textDecoration: 'underline' }}>Simulasi Anggaran</Link>.{waiting > 0 && <> {n(waiting)} mahasiswa berisiko belum tertampung.</>}</p>
        </div>
        <div className="actions">
          <label className="lbl" htmlFor="me" style={{ margin: 0 }}>Masuk sebagai</label>
          <select id="me" className="select" value={me} onChange={(e) => setMe(e.target.value)}>
            {team.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b className="num">{n(mine.length)}</b><span>mahasiswa dalam tanggungan {me}</span></div>
        <div className="stat"><b className="num">{n(touched)}</b><span>sudah ditangani ({pct(mine.length ? touched / mine.length : 0, 0)})</span></div>
        <div className="stat"><b className="num">{n(open.length)}</b><span>sedang didampingi, perlu dicek lagi</span></div>
        <div className="stat"><b className="num">{n(done)}</b><span>selesai</span></div>
      </div>

      <section className="section">
        <div className="section-head"><div><span className="eyebrow risk">01 / Hubungi hari ini</span><h2>Urut dari yang paling mendesak.</h2></div>
          {today.length > 1 && (
            <button className="btn primary" style={{ marginLeft: 'auto' }} disabled={busy !== null}
              onClick={async () => { setBusy(-1); await act(today.map((s) => s.id), 'wa', 'Pesan templat massal dari antrian', { konselor: me }); setBusy(null); }}>
              {busy === -1 ? 'Mengirim…' : `Kirim WA ke semua (${today.length})`}
            </button>
          )}
        </div>
        {today.length === 0 ? <p className="notice">Semua mahasiswa dalam tanggungan sudah ditangani.</p> : (
          <ol className="queue">
            {today.map((s, i) => (
              <li key={s.id}>
                <span className="queue-n num">{String(i + 1).padStart(2, '0')}</span>
                <div className="queue-who">
                  <Link href={`/mahasiswa/${s.id}`}><b className="num">{s.id}</b></Link> <TierPill tier={s.tier} />
                  <span className="sub">{s.mod} · {PRES_LABEL[s.pres]} · risiko {pct(s.p, 0)}</span>
                </div>
                <div className="queue-why">
                  <b>{why(s)}</b>
                  <span className="sub">{PLAYBOOK[s.sig[0]] ?? 'Sapa lewat dosen PA dan tanyakan kendalanya.'}</span>
                </div>
                <div className="queue-act">
                  <button className="btn primary" disabled={busy === s.id}
                    onClick={async () => { setBusy(s.id); await act([s.id], 'wa', 'Pesan templat dari antrian', { konselor: me }); setBusy(null); }}>Kirim WA</button>
                  <Link className="btn" href={`/mahasiswa/${s.id}`}>Buka</Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {open.length > 0 && (
        <section className="section">
          <div className="section-head"><div><span className="eyebrow">02 / Sedang berjalan</span><h2>Sudah dihubungi, belum selesai.</h2></div></div>
          <table className="card flush">
            <tbody>
              {open.slice(0, 30).map((s) => (
                <tr key={s.id}>
                  <td style={{ paddingLeft: 22 }}><Link href={`/mahasiswa/${s.id}`}><b className="num">{s.id}</b></Link><span className="sub">{why(s)}</span></td>
                  <td>{STATUS_LABEL[st(s)]}</td>
                  <td className="faint small num">{new Date(rows[s.id].updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                  <td style={{ paddingRight: 22, textAlign: 'right' }}>
                    {st(s) === 'dihubungi' && <button className="btn" onClick={() => act([s.id], 'status', 'Masuk pendampingan', { status: 'didampingi', konselor: me })}>Mulai pendampingan</button>}
                    {st(s) === 'didampingi' && <button className="btn" onClick={() => act([s.id], 'status', 'Pendampingan selesai', { status: 'selesai', konselor: me })}>Tandai selesai</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
