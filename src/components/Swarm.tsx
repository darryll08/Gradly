'use client';
// The Ringkasan hero: every test student is one dot on a 2D canvas, and the dots fly between three
// arrangements. "hari" is a scatter of last active day against risk (the day-14 cliff shows itself);
// "tingkat" and "modul" stack the same dots into dot-columns, coral where the model flags a student.
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Student, Tier } from '@/lib/data';
import { TIER_LABEL } from '@/lib/data';
import { PRES_LABEL } from '@/lib/format';

export type SwarmView = 'hari' | 'tingkat' | 'modul';
const TIERS: Tier[] = ['merah', 'oranye', 'kuning', 'hijau'];
const RGB: Record<string, [number, number, number]> = {
  coral: [228, 87, 46], navy: [31, 58, 95], merah: [228, 87, 46], oranye: [243, 154, 123], kuning: [227, 183, 150], hijau: [31, 157, 139],
};
const PAD = { l: 52, r: 24, t: 54, b: 46 };
const DUR = 0.9, STAGGER = 0.35;
const ease = (x: number) => 1 - Math.pow(1 - x, 3);
type Label = { x: number; y: number; text: string; big?: boolean; color?: string; align?: CanvasTextAlign };

// pseudo-random but stable per student, so jitter does not reshuffle on every layout
const rnd = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

function layout(view: SwarmView, students: Student[], W: number, H: number) {
  const n = students.length;
  const pos = new Float32Array(n * 2), col = new Float32Array(n * 4), labels: Label[] = [];
  const paint = (i: number, c: [number, number, number], a: number) => { col.set([c[0], c[1], c[2], a], i * 4); };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

  if (view === 'hari') {
    students.forEach((s, i) => {
      const day = Math.min(28, Math.max(0, s.last));
      pos[i * 2] = PAD.l + ((day + (rnd(i, 1) - 0.5) * 0.85) / 28) * iw;
      pos[i * 2 + 1] = PAD.t + (1 - Math.min(1, Math.max(0, s.p + (rnd(i, 2) - 0.5) * 0.02))) * ih;
      if (s.pred === 1) paint(i, RGB.coral, 0.8); else paint(i, RGB.navy, 0.35);
    });
    [1, 7, 14, 21, 28].forEach((d) => labels.push({ x: PAD.l + (d / 28) * iw, y: H - PAD.b + 22, text: `Hari ${d}`, align: 'center' }));
    [0, 0.5, 1].forEach((v) => labels.push({ x: PAD.l - 12, y: PAD.t + (1 - v) * ih + 4, text: `${v * 100}%`, align: 'right' }));
    labels.push({ x: PAD.l, y: PAD.t - 22, text: 'Risiko gagal ↑', align: 'left' });
    labels.push({ x: W - PAD.r, y: H - PAD.b + 40, text: 'Hari terakhir aktif di LMS →', align: 'right' });
    labels.push({ x: PAD.l + (14 / 28) * iw + 8, y: PAD.t - 22, text: 'Hari ke-14', align: 'left', color: '#B23A17' });
    return { pos, col, labels, guide: PAD.l + (14 / 28) * iw };
  }

  // dot-columns: one column per group, risky dots at the bottom
  const groups: { key: string; ids: number[]; top: string; bottom: string }[] = [];
  if (view === 'tingkat') {
    TIERS.forEach((t) => {
      const ids = students.map((_, i) => i).filter((i) => students[i].tier === t)
        .sort((a, b) => Number(students[a].ghost) - Number(students[b].ghost) || students[b].p - students[a].p);
      groups.push({ key: t, ids, top: ids.length.toLocaleString('id-ID'), bottom: TIER_LABEL[t] });
    });
  } else {
    const mods = [...new Set(students.map((s) => s.mod))];
    mods.map((m) => {
      const ids = students.map((_, i) => i).filter((i) => students[i].mod === m).sort((a, b) => students[b].pred - students[a].pred || students[b].p - students[a].p);
      const share = ids.filter((i) => students[i].pred === 1).length / ids.length;
      return { m, ids, share };
    }).sort((a, b) => b.share - a.share).forEach(({ m, ids, share }) => groups.push({ key: m, ids, top: `${Math.round(share * 100)}%`, bottom: m }));
  }
  const G = groups.length, maxN = Math.max(...groups.map((g) => g.ids.length));
  let cell = W < 640 ? 3.4 : 4.6, perRow = 1, colW = 0;
  for (let k = 0; k < 6; k++) {   // shrink the cell until every column fits side by side
    perRow = Math.ceil(maxN / Math.floor(ih / cell));
    colW = perRow * cell;
    if (G * colW + (G + 1) * 14 <= iw) break;
    cell *= 0.85;
  }
  const gap = (iw - G * colW) / (G + 1);
  groups.forEach((g, gi) => {
    const x0 = PAD.l + gap * (gi + 1) + gi * colW;
    g.ids.forEach((i, k) => {
      pos[i * 2] = x0 + (k % perRow) * cell + cell / 2;
      pos[i * 2 + 1] = H - PAD.b - Math.floor(k / perRow) * cell - cell / 2;
      const s = students[i];
      if (view === 'tingkat') paint(i, RGB[s.tier], s.ghost ? 0.28 : 0.85);
      else if (s.pred === 1) paint(i, RGB.coral, 0.85); else paint(i, RGB.navy, 0.3);
    });
    const rows = Math.ceil(g.ids.length / perRow);
    labels.push({ x: x0 + colW / 2, y: H - PAD.b - rows * cell - 12, text: g.top, big: true, align: 'center', color: view === 'modul' ? '#B23A17' : '#1E2A38' });
    labels.push({ x: x0 + colW / 2, y: H - PAD.b + 22, text: g.bottom, align: 'center' });
  });
  return { pos, col, labels, guide: null as number | null };
}

export default function Swarm({ students, view }: { students: Student[]; view: SwarmView }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const st = useRef({
    from: new Float32Array(0), to: new Float32Array(0), cf: new Float32Array(0), ct: new Float32Array(0),
    now: new Float32Array(0), cur: new Float32Array(0), t0: 0, labels: [] as Label[], guide: null as number | null, raf: 0,
  });
  const delay = useMemo(() => Float32Array.from(students, (_, i) => rnd(i, 9) * STAGGER), [students]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // new target layout: start a flight from wherever the dots are now
  useEffect(() => {
    const c = cv.current;
    if (!c || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr; c.height = size.h * dpr;
    c.style.width = `${size.w}px`; c.style.height = `${size.h}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = st.current, n = students.length;
    const L = layout(view, students, size.w, size.h);
    if (S.now.length !== n * 2) {   // first paint: dots rise from a loose cloud in the middle
      S.now = Float32Array.from({ length: n * 2 }, (_, k) => (k % 2 === 0 ? size.w / 2 + (rnd(k, 3) - 0.5) * size.w * 0.5 : size.h / 2 + (rnd(k, 4) - 0.5) * size.h * 0.4));
      S.cur = L.col.slice(); for (let i = 0; i < n; i++) S.cur[i * 4 + 3] = 0;
    }
    // start from where every dot is right now, even if the last flight was cut short
    S.from = S.now.slice(); S.to = L.pos; S.cf = S.cur.slice(); S.ct = L.col;
    S.labels = L.labels; S.guide = L.guide;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    S.t0 = performance.now() - (reduce ? 1e6 : 0);
    const cur = S.cur;
    const css = getComputedStyle(document.documentElement);   // canvas fonts cannot read CSS variables
    const serif = `400 20px ${css.getPropertyValue('--font-serif') || 'Georgia'}, Georgia, serif`;
    const sans = `500 11px ${css.getPropertyValue('--font-inter') || 'system-ui'}, system-ui, sans-serif`;

    const frame = () => {
      const t = (performance.now() - S.t0) / 1000;
      let done = true;
      ctx.clearRect(0, 0, size.w, size.h);
      if (S.guide != null) {   // the day-14 line sits behind the dots
        ctx.strokeStyle = 'rgba(228,87,46,.55)'; ctx.setLineDash([3, 4]); ctx.beginPath();
        ctx.moveTo(S.guide, PAD.t - 12); ctx.lineTo(S.guide, size.h - PAD.b); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(30,42,56,.12)';
        ctx.beginPath(); ctx.moveTo(PAD.l, size.h - PAD.b + 0.5); ctx.lineTo(size.w - PAD.r, size.h - PAD.b + 0.5); ctx.stroke();
      }
      const r = size.w < 640 ? 1.3 : 1.7;
      for (let i = 0; i < n; i++) {
        const k = Math.min(1, Math.max(0, (t - delay[i]) / DUR));
        if (k < 1) done = false;
        const e = ease(k);
        const x = S.from[i * 2] + (S.to[i * 2] - S.from[i * 2]) * e;
        const y = S.from[i * 2 + 1] + (S.to[i * 2 + 1] - S.from[i * 2 + 1]) * e;
        S.now[i * 2] = x; S.now[i * 2 + 1] = y;
        for (let q = 0; q < 4; q++) cur[i * 4 + q] = S.cf[i * 4 + q] + (S.ct[i * 4 + q] - S.cf[i * 4 + q]) * e;
        ctx.fillStyle = `rgba(${cur[i * 4] | 0},${cur[i * 4 + 1] | 0},${cur[i * 4 + 2] | 0},${cur[i * 4 + 3].toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      }
      const la = Math.min(1, Math.max(0, (t - DUR * 0.7) / 0.4));   // labels arrive once the dots have landed
      ctx.globalAlpha = la;
      for (const l of S.labels) {
        ctx.textAlign = l.align ?? 'left';
        ctx.fillStyle = l.color ?? '#8C939C';
        ctx.font = l.big ? serif : sans;
        ctx.fillText(l.text, l.x, l.y);
      }
      ctx.globalAlpha = 1;
      if (!done || la < 1) S.raf = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(S.raf);
  }, [view, students, size, delay]);

  const pick = (ev: React.MouseEvent) => {
    const rect = cv.current!.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top, P = st.current.to;
    let best = -1, bd = 49;
    for (let i = 0; i < students.length; i++) {
      const dx = P[i * 2] - x, dy = P[i * 2 + 1] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    setHover(best < 0 ? null : { i: best, x: P[best * 2], y: P[best * 2 + 1] });
  };
  const h = hover ? students[hover.i] : null;

  return (
    <div ref={box} className="swarm">
      <canvas ref={cv} onMouseMove={pick} onMouseLeave={() => setHover(null)} onClick={() => h && router.push(`/mahasiswa/${h.id}`)}
        role="img" aria-label="Sebaran 6.502 mahasiswa menurut risiko" />
      {h && hover && (
        <>
          <span className="swarm-ring" style={{ left: hover.x, top: hover.y }} />
          <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
            <b>#{h.id}</b> · {h.mod} · {PRES_LABEL[h.pres]}<br />
            Risiko {Math.round(h.p * 100)}% · {TIER_LABEL[h.tier]}{h.ghost ? ' · akun kembar' : ''} · aktif terakhir hari {h.last}
          </div>
        </>
      )}
    </div>
  );
}
