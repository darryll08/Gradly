'use client';
// Follow-up status per student + a log of every action. Uses Supabase when NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
// are set (tables: supabase/schema.sql), otherwise this browser's localStorage.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

export type Status = 'belum' | 'dihubungi' | 'didampingi' | 'selesai';
export const STATUS_LABEL: Record<Status, string> = {
  belum: 'Belum ditangani', dihubungi: 'Sudah dihubungi', didampingi: 'Dalam pendampingan', selesai: 'Selesai',
};
export type Rencana = { dari: number; ke: number; ubah: string[] };
export type FollowUp = { student_id: number; status: Status; note: string; updated_at: string; konselor?: string | null; rencana?: Rencana | null };
export type Aksi = { id?: number; student_id: number; jenis: string; catatan: string; konselor: string | null; kampanye: string | null; created_at: string };

export const AKSI_LABEL: Record<string, string> = {
  wa: 'Kirim pesan WA', telepon: 'Telepon', jadwal: 'Jadwalkan pertemuan', remedial: 'Rujuk ke remedial / dosen',
  status: 'Ubah status', rencana: 'Simpan rencana', massal: 'Aksi massal',
};
// one-click actions on the profile; each also moves a 'belum' student to 'dihubungi'
export const QUICK: string[] = ['wa', 'telepon', 'jadwal', 'remedial'];

// Counselling team. The team size is shared with the budget page ("Terapkan") through localStorage.
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const KONSELOR = Array.from({ length: 80 }, (_, i) => `Konselor ${i < 26 ? AZ[i] : AZ[Math.floor(i / 26) - 1] + AZ[i % 26]}`);
export const TIM_DEFAULT = { k: 10, per: 80 };   // same defaults as the budget sliders
export const DAILY = 15;   // students one counselor works through per day

/** Flagged students (twin accounts excluded) dealt round-robin from the riskiest down, so every counselor
 *  gets the same mix. A counselor saved on the follow-up row wins over this default. */
export function assign(students: { id: number; p: number; pred: number; ghost: boolean }[], k: number, rows: Record<number, FollowUp>, per = Infinity) {
  const m = new Map<number, string>();
  // only as many as the team can hold (k × per); the rest wait for more budget
  students.filter((s) => s.pred === 1 && !s.ghost).sort((a, b) => b.p - a.p).slice(0, k * per)
    .forEach((s, i) => m.set(s.id, rows[s.id]?.konselor ?? KONSELOR[i % k]));
  return m;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let client: SupabaseClient | null = null;
const sb = () => (url && key ? (client ??= createClient(url, key)) : null);
export const trackerBackend = () => (sb() ? 'Supabase' : 'browser ini');

const LS = 'sinyal.followups.v1';
const LS_AKSI = 'gradly.aksi.v1';
const read = <T,>(k: string, d: T): T => {
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; }
};
const write = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep in memory only */ }
};

// tiny pub-sub so every mounted hook sees a save made elsewhere on the page
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

export function useFollowUps() {
  const [rows, setRows] = useState<Record<number, FollowUp>>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);

  useEffect(() => {
    const c = sb();
    if (!c) { setRows(read(LS, {})); setReady(true); return; }
    // Supabase returns at most 1000 rows per request: page through
    (async () => {
      const all: FollowUp[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await c.from('tindak_lanjut').select('*').range(from, from + 999);
        if (e) { setError(e.message); setRows(read(LS, {})); setReady(true); return; }
        all.push(...(data as FollowUp[]));
        if (!data || data.length < 1000) break;
      }
      setRows(Object.fromEntries(all.map((r) => [r.student_id, r])));
      setReady(true);
    })();
  }, [tick]);

  /** Log one action for many students and update their follow-up row. */
  const act = useCallback(async (ids: number[], jenis: string, catatan: string,
    opt: { status?: Status; konselor?: string | null; kampanye?: string | null; rencana?: Rencana; note?: string } = {}) => {
    const now = new Date().toISOString();
    const cur: Record<number, FollowUp> = sb() ? rows : read(LS, {});
    const fu: FollowUp[] = ids.map((id) => {
      const prev = cur[id];
      const status = opt.status ?? (!prev || prev.status === 'belum' ? 'dihubungi' : prev.status);
      return {
        student_id: id, status, note: opt.note ?? prev?.note ?? '', updated_at: now,
        konselor: opt.konselor ?? prev?.konselor ?? null, rencana: opt.rencana ?? prev?.rencana ?? null,
      };
    });
    const log: Aksi[] = ids.map((id) => ({ student_id: id, jenis, catatan, konselor: opt.konselor ?? null, kampanye: opt.kampanye ?? null, created_at: now }));
    const c = sb();
    if (c) {
      const [a, b] = await Promise.all([c.from('tindak_lanjut').upsert(fu), c.from('aksi').insert(log)]);
      const e = a.error ?? b.error;
      if (e) { setError(e.message); return false; }
    } else {
      write(LS, { ...cur, ...Object.fromEntries(fu.map((r) => [r.student_id, r])) });
      write(LS_AKSI, [...log, ...read<Aksi[]>(LS_AKSI, [])].slice(0, 20000));
    }
    setError(null);
    ping();
    return true;
  }, [rows]);

  const save = useCallback((student_id: number, status: Status, note: string, konselor?: string | null) =>
    act([student_id], 'status', `${STATUS_LABEL[status]}${note ? ` · ${note}` : ''}`, { status, note, konselor }), [act]);

  return { rows, ready, save, act, error };
}

/** Action history of one student, newest first. */
export function useAksi(studentId: number | null) {
  const [list, setList] = useState<Aksi[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  useEffect(() => {
    if (studentId == null) return;
    const c = sb();
    if (!c) { setList(read<Aksi[]>(LS_AKSI, []).filter((a) => a.student_id === studentId)); return; }
    c.from('aksi').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setList((data as Aksi[]) ?? []));
  }, [studentId, tick]);
  return list;
}

/** Who is signed in (demo: picked from a list) and how many counselors the budget allows. */
export function useTim() {
  const [me, setMeState] = useState<string>(KONSELOR[0]);
  const [k, setKState] = useState<number>(TIM_DEFAULT.k);
  const [per, setPerState] = useState<number>(TIM_DEFAULT.per);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const k0 = read('gradly.konselor', TIM_DEFAULT.k);
    const me0 = read('gradly.saya', KONSELOR[0]);
    setKState(k0);
    setPerState(read('gradly.per', TIM_DEFAULT.per));
    setMeState(KONSELOR.indexOf(me0) < k0 ? me0 : KONSELOR[0]);
    setReady(true);
  }, []);
  const setMe = (v: string) => { setMeState(v); write('gradly.saya', v); };
  const apply = (k1: number, per1: number) => {
    setKState(k1); setPerState(per1); write('gradly.konselor', k1); write('gradly.per', per1);
    if (KONSELOR.indexOf(me) >= k1) setMe(KONSELOR[0]);
  };
  return { me, setMe, k, per, apply, ready };
}

/** Bulk campaigns: name → students reached and when it last ran. */
export function useKampanye() {
  const [list, setList] = useState<{ nama: string; n: number; last: string }[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  useEffect(() => {
    (async () => {
      const c = sb();
      let rows: Pick<Aksi, 'kampanye' | 'student_id' | 'created_at'>[] = [];
      if (!c) rows = read<Aksi[]>(LS_AKSI, []).filter((a) => a.kampanye);
      else {
        for (let from = 0; ; from += 1000) {
          const { data } = await c.from('aksi').select('kampanye,student_id,created_at').not('kampanye', 'is', null).range(from, from + 999);
          rows.push(...((data as typeof rows) ?? []));
          if (!data || data.length < 1000) break;
        }
      }
      const m = new Map<string, { ids: Set<number>; last: string }>();
      rows.forEach((r) => {
        const g = m.get(r.kampanye!) ?? { ids: new Set<number>(), last: r.created_at };
        g.ids.add(r.student_id);
        if (r.created_at > g.last) g.last = r.created_at;
        m.set(r.kampanye!, g);
      });
      setList([...m.entries()].map(([nama, g]) => ({ nama, n: g.ids.size, last: g.last })).sort((a, b) => b.last.localeCompare(a.last)));
    })();
  }, [tick]);
  return list;
}
