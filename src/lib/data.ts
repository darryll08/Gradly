'use client';
import { useEffect, useState } from 'react';

export type Tier = 'merah' | 'oranye' | 'kuning' | 'hijau';
export type Attempt = { id: number; mod: string; pres: string; att: number; score: number | null; days: number; outcome: number | null };
export type Student = {
  id: number; mod: string; pres: string; p: number; pred: number; tier: Tier; seg: string;
  gender: string; region: string; edu: string; imd: string; age: string; dis: string;
  att: number; credits: number; days: number; clicks: number; weeks: number[];
  first: number; last: number; score: number | null; nosub: boolean; ghost: boolean;
  sig: string[]; prot: string[]; jejak: Attempt[] | null; g: [number, number, number];
};
export type Summary = {
  nTest: number; flagged: number; cutoff: number; tiers: Record<Tier, number>;
  vanished14: number; vanished14Flagged: number; nosub: number; ghost: number; withJejak: number; baseRate: number;
  oof: { f1: number; precision: number; recall: number; auc: number; tp: number; fp: number; tn: number; fn: number };
  leaderboard: { public: number; private: number }; kRatio: number;
  jejakRates: { prevNoScore: number; prevScore: number; hasNext: number };
  insights: Record<string, number>;
};
// SHAP from CatBoost V16 (seed 42), raw features summed into themes; value in log-odds, + = toward at-risk.
export type Shap = { model: string; base: number; groups: [string, number][]; top10: [string, number][]; students: Record<string, [string, number][]> };
export const SHAP_GROUP: Record<string, string> = {
  tugas: 'Pengumpulan tugas', nilai: 'Nilai tugas', telat: 'Ketepatan waktu tugas', aktif: 'Keaktifan di LMS',
  waktu: 'Kapan mulai & berhenti muncul', modul: 'Modul & semester', pendidikan: 'Pendidikan terakhir',
  ekonomi: 'Ekonomi wilayah (IMD)', beban: 'Beban studi', riwayat: 'Percobaan sebelumnya', demografi: 'Umur, wilayah, gender, disabilitas',
};
export type Signal ={ label: string; rate: number; n: number; kind: 'risk' | 'protect' };
export type CapacityPoint = { pct: number; precision: number; recall: number };
export type GroupStat = { group: string; n: number; prevalence: number; flagged: number; recall: number; precision: number };
export type DayPoint = { day: number; lastN: number; lastRate: number | null; firstN: number; firstRate: number | null };
export type Modules = {
  modules: { mod: string; n: number; flagged: number; merah: number; trainRate: number | null }[];
  regions: { region: string; n: number; flagged: number }[];
  imd: { group: string; n: number; flagged: number }[];
};
export type Audit = {
  ghostTrain: number; ghostTest: number; ghostRate: number; placeholderRows: number; placeholderShare: number;
  placeholderValues: number[]; placeholderTest: number; spellingVariants: string[]; unknownModule: string; unknownModuleRows: number;
  avgScoreRecorded: number; avgScoreReal: number;
};

const cache = new Map<string, Promise<unknown>>();
export function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) cache.set(name, fetch(`/data/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.json();
  }));
  return cache.get(name) as Promise<T>;
}

export function useData<T>(name: string): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load<T>(name).then((d) => live && setData(d)).catch((e) => live && setError(String(e.message ?? e)));
    return () => { live = false; };
  }, [name]);
  return { data, error };
}

export const TIER_LABEL: Record<Tier, string> = { merah: 'Kritis', oranye: 'Tinggi', kuning: 'Sedang', hijau: 'Aman' };
export const TIER_HINT: Record<Tier, string> = {
  merah: 'Hubungi dalam 48 jam',
  oranye: 'Masuk program pendampingan',
  kuning: 'Pantau tiap minggu',
  hijau: 'Tidak perlu tindakan',
};
export const TIER_COLOR: Record<Tier, string> = { merah: '#E4572E', oranye: '#F39A7B', kuning: '#F2C7AE', hijau: '#1F9D8B' };

// What a counselor does first, per warning sign (shared by the profile and the grouped list).
export const PLAYBOOK: Record<string, string> = {
  nosub: 'Hubungi soal tugas pertama: tanyakan hambatannya, tawarkan perpanjangan satu kali.',
  ghost: 'Pastikan akun benar-benar dipakai: telepon atau temui langsung, bukan email.',
  vanished: 'Kontak personal dalam 48 jam; ajak kembali ke kelas minggu ini.',
  lowactive: 'Pasangkan dengan tutor sebaya dan jadwal belajar mingguan.',
  latestart: 'Sesi orientasi singkat: cara memakai LMS dan apa yang dikejar dulu.',
  lowscore: 'Rujuk ke kelas remedial atau jam konsultasi dosen untuk materi tugas.',
  repeat: 'Rencana studi bersama dosen PA: apa yang beda dari percobaan sebelumnya.',
  heavy: 'Tinjau beban studi bersama dosen PA; pertimbangkan mengurangi modul.',
  prevnoscore: 'Pengulang tanpa nilai sebelumnya: dampingi sejak minggu pertama, jangan tunggu.',
};
