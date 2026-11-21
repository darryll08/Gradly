const nf = new Intl.NumberFormat('id-ID');
export const n = (v: number) => nf.format(Math.round(v));
export const pct = (v: number, d = 1) => `${(v * 100).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const rp = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} miliar` : a >= 1e6 ? `${(a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} juta` : nf.format(a);
  return `${v < 0 ? '−' : ''}Rp${s}`;
};
export const PRES_LABEL: Record<string, string> = { P11: 'Semester 1', P12: 'Semester 2', P21: 'Semester 3', P22: 'Semester 4' };
