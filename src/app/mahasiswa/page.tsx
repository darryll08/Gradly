'use client';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useData, type Student, type Signal, type Tier, TIER_LABEL, TIER_COLOR, PLAYBOOK } from '@/lib/data';
import { n, pct, PRES_LABEL } from '@/lib/format';
import { TierPill, Loading, Failed } from '@/components/ui';
import { useFollowUps, useTim, assign, STATUS_LABEL, AKSI_LABEL } from '@/lib/tracker';

const TIERS: Tier[] = ['merah', 'oranye', 'kuning', 'hijau'];
const PAGE = 50;

function List() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: students, error } = useData<Student[]>('students');
  const { data: sig } = useData<Record<string, Signal>>('signals');
  const { rows: follow, act, error: saveErr } = useFollowUps();
  const { me, k, per } = useTim();
  const [limit, setLimit] = useState(PAGE);
  const [bulk, setBulk] = useState('wa');
  const [camp, setCamp] = useState('');
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const tier = params.get('tier') as Tier | null;
  const pred = params.get('pred');
  const mod = params.get('mod');
  const sinyal = params.get('sinyal');
  const jejak = params.get('jejak');
  const status = params.get('status');
  const kembar = params.get('kembar');   // twin accounts stay out of the list unless asked for: check their data first

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v); else p.delete(k);
    if (k === 'tier') p.delete('pred');
    setLimit(PAGE);
    router.replace(`/mahasiswa${p.toString() ? `?${p}` : ''}`, { scroll: false });
  };

  const rows = useMemo(() => {
    if (!students) return [];
    return students
      .filter((s) => (!tier || s.tier === tier) && (!pred || s.pred === Number(pred)) && (!mod || s.mod === mod)
        && (!sinyal || (sinyal === 'lainnya' ? s.sig.length === 0 : s.sig.includes(sinyal))) && (!jejak || !!s.jejak)
        && (!status || (follow[s.id]?.status ?? 'belum') === status) && s.ghost === !!kembar)
      .sort((a, b) => b.p - a.p);
  }, [students, tier, pred, mod, sinyal, jejak, status, follow, kembar]);

  // students the model flags, grouped by their strongest warning sign: a counselor plans per group, not per row
  const groups = useMemo(() => {
    if (!students) return [];
    const m = new Map<string, Student[]>();
    students.filter((x) => !x.ghost && x.pred === 1).forEach((x) => {
      const k = x.sig[0] ?? 'lainnya';
      m.set(k, [...(m.get(k) ?? []), x]);
    });
    return [...m.entries()].map(([k, list]) => ({ k, list: list.sort((a, b) => b.p - a.p) })).sort((a, b) => b.list.length - a.list.length);
  }, [students]);

  if (error) return <Failed what="mahasiswa" />;
  const mods = students ? [...new Set(students.map((s) => s.mod))].sort() : [];
  const handled = students ? Object.values(follow).filter((f) => f.status !== 'belum').length : 0;

  return (
    <>
      <div className="title-row">
        <div>
          <span className="eyebrow">Daftar prioritas · minggu ini</span>
          <h1>Jangan dibaca satu per satu.<br /><em>Mulai dari kelompoknya.</em></h1>
          <p>{kembar
            ? 'Akun kembar: jejak aktivitasnya persis sama dengan akun lain. Pastikan akunnya benar dipakai sebelum dihubungi.'
            : 'Diurutkan dari risiko tertinggi. Akun kembar ditampilkan terpisah.'}{' '}
            {students && <>{n(rows.length)} mahasiswa sesuai filter · {n(handled)} sudah ditindaklanjuti.</>}</p>
        </div>
      </div>

      {!kembar && (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow risk">01 / Kelompok alasan</span>
              <h2>{students ? n(groups.reduce((a, g) => a + g.list.length, 0)) : '…'} mahasiswa berisiko, menurut tanda utamanya.</h2>
            </div>
          </div>
          {!students || !sig ? <Loading h={220} /> : (
            <div className="reasons">
              {groups.map((g) => (
                <button key={g.k} className="reason" aria-pressed={sinyal === g.k} onClick={() => set('sinyal', sinyal === g.k ? null : g.k)}>
                  <span className="reason-n num">{n(g.list.length)}</span>
                  <span className="reason-label">{sig[g.k]?.label ?? 'Tidak ada satu tanda yang menonjol; risikonya dari gabungan banyak faktor kecil'}</span>
                  <span className="reason-dots" aria-hidden>
                    {g.list.slice(0, 160).map((x) => <i key={x.id} style={{ background: TIER_COLOR[x.tier] }} />)}
                    {g.list.length > 160 && <em>+{n(g.list.length - 160)}</em>}
                  </span>
                  <span className="reason-act">{PLAYBOOK[g.k] ?? 'Pantau tiap minggu dan sapa lewat dosen PA.'}</span>
                  <span className="reason-go">{sinyal === g.k ? 'Tampil di daftar ↓' : 'Lihat siapa saja →'}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="section-head">
        <div>
          <span className="eyebrow">{kembar ? 'Akun kembar' : '02 / Daftar'}</span>
          <h2>{sinyal && sig ? (sig[sinyal]?.label ?? 'Tanpa tanda tunggal yang menonjol.') : kembar ? 'Cek datanya dulu.' : 'Semua, dari risiko tertinggi.'}</h2>
        </div>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Tingkat">
          <button aria-pressed={!tier && !pred} onClick={() => { set('tier', null); }}>Semua</button>
          {TIERS.map((t) => <button key={t} aria-pressed={tier === t} onClick={() => set('tier', tier === t ? null : t)}>{TIER_LABEL[t]}</button>)}
        </div>
        <select className="select" value={mod ?? ''} onChange={(e) => set('mod', e.target.value || null)} aria-label="Modul">
          <option value="">Semua modul</option>
          {mods.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="select" value={sinyal ?? ''} onChange={(e) => set('sinyal', e.target.value || null)} aria-label="Tanda peringatan">
          <option value="">Semua tanda</option>
          {sig && Object.entries(sig).filter(([, v]) => v.kind === 'risk').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="select" value={status ?? ''} onChange={(e) => set('status', e.target.value || null)} aria-label="Status tindak lanjut">
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="chip" aria-pressed={!!jejak} onClick={() => set('jejak', jejak ? null : '1')}>Punya riwayat mengulang</button>
        <button className="chip" aria-pressed={!!kembar} onClick={() => set('kembar', kembar ? null : '1')}>Akun kembar · cek data</button>
        {pred && <button className="chip" aria-pressed onClick={() => set('pred', null)}>Hanya yang diperkirakan gagal · hapus</button>}
      </div>

      {students && rows.length > 0 && !kembar && (
        <div className="bulk">
          <span><b className="num">{n(rows.length)}</b> mahasiswa di filter ini · {n(rows.filter((s) => (follow[s.id]?.status ?? 'belum') === 'belum').length)} belum ditangani</span>
          <select className="select" value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Jenis aksi massal">
            {['wa', 'jadwal', 'remedial'].map((j) => <option key={j} value={j}>{AKSI_LABEL[j]}</option>)}
          </select>
          <input className="field" style={{ flex: '1 1 200px', minHeight: 0 }} value={camp} onChange={(e) => setCamp(e.target.value)}
            placeholder={sinyal && sig ? `Nama kampanye, mis. "${sig[sinyal]?.label ?? 'Kampanye'}"` : 'Nama kampanye'} />
          <button className="btn primary" onClick={async () => {
            const target = rows.filter((s) => (follow[s.id]?.status ?? 'belum') === 'belum');
            if (!target.length) { setBulkMsg('Semua sudah ditangani.'); return; }
            if (!window.confirm(`Catat "${AKSI_LABEL[bulk]}" untuk ${target.length} mahasiswa yang belum ditangani?`)) return;
            const owner = assign(students, k, follow, per);
            const name = camp || (sinyal && sig?.[sinyal]?.label) || 'Kampanye massal';
            // one call per counselor so each action is logged under the person who owns the student
            const by = new Map<string, number[]>();
            target.forEach((s) => { const o = owner.get(s.id) ?? me; by.set(o, [...(by.get(o) ?? []), s.id]); });
            for (const [who, ids] of by) await act(ids, bulk, `Aksi massal: ${name}`, { konselor: who, kampanye: name });
            setBulkMsg(`${n(target.length)} mahasiswa dicatat ke ${by.size} konselor.`);
          }}>Jalankan</button>
          {bulkMsg && <span className="small faint">{bulkMsg}</span>}
          {saveErr && <span className="small" style={{ color: 'var(--accent-ink)' }}>Gagal: {saveErr}</span>}
        </div>
      )}

      <section className="card flush">
        {!students ? <div style={{ padding: 22 }}><Loading h={400} /></div> : rows.length === 0 ? (
          <p className="notice" style={{ padding: 22 }}>Tidak ada mahasiswa yang cocok dengan filter ini.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Mahasiswa</th>
                <th className="num">Risiko</th>
                <th>Tingkat</th>
                <th className="hide-sm">Tanda utama</th>
                <th className="num hide-sm">Hari aktif</th>
                <th className="num hide-sm">Nilai tugas</th>
                <th className="hide-sm" style={{ paddingRight: 22 }}>Tindak lanjut</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((s) => (
                <tr key={s.id} className="clickable" onClick={() => router.push(`/mahasiswa/${s.id}`)}>
                  <td style={{ paddingLeft: 22 }}>
                    <Link href={`/mahasiswa/${s.id}`} onClick={(e) => e.stopPropagation()}><b className="num">{s.id}</b></Link>
                    <span className="sub">{s.mod} · {PRES_LABEL[s.pres]}</span>
                  </td>
                  <td className="num"><b>{pct(s.p, 0)}</b></td>
                  <td><TierPill tier={s.tier} /></td>
                  <td className="hide-sm" style={{ maxWidth: 320 }}>
                    {s.sig[0] && sig ? <span>{sig[s.sig[0]].label}</span> : <span className="dash">—</span>}
                    {s.sig.length > 1 && <span className="sub">+{s.sig.length - 1} tanda lain</span>}
                  </td>
                  <td className="num hide-sm">{s.days}<span className="faint"> /28</span></td>
                  <td className="num hide-sm">{s.score == null ? <span className="dash">—</span> : s.score.toFixed(0)}</td>
                  <td className="hide-sm" style={{ paddingRight: 22 }}>
                    <span className={follow[s.id] && follow[s.id].status !== 'belum' ? '' : 'faint'}>{STATUS_LABEL[follow[s.id]?.status ?? 'belum']}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {students && rows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderTop: '1px solid var(--rule)' }}>
            <span className="faint num">1–{n(Math.min(limit, rows.length))} dari {n(rows.length)}</span>
            {limit < rows.length && <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setLimit(limit + PAGE * 2)}>Tampilkan lebih banyak</button>}
          </div>
        )}
      </section>
    </>
  );
}

export default function Page() {
  return <main className="canvas"><Suspense fallback={<Loading h={400} />}><List /></Suspense></main>;
}
