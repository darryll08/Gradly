'use client';
// Small SVG charts drawn to the app rules: one hue on the main series, grey for the rest,
// 4-5 faint gridlines, round ticks, labelled markers, no chart library.
import { Key } from './ui';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo, useRef, useState, useEffect } from 'react';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

type Series = { points: { x: number; y: number }[]; main?: boolean; label: string };
type Marker = { x: number; label: string; strong?: boolean };

// y of a series at x, read off its straight segments
const valueAt = (pts: { x: number; y: number }[], x: number) => {
  const j = pts.findIndex((p) => p.x >= x);
  if (j <= 0) return pts[Math.max(0, j)]?.y ?? pts[pts.length - 1].y;
  const a = pts[j - 1], b = pts[j];
  return a.y + ((b.y - a.y) * (x - a.x)) / Math.max(1e-9, b.x - a.x);
};

export function LineChart({ series, xMax, xTicks, yTicks = [0, 0.25, 0.5, 0.75, 1], fmtX, fmtY, markers = [], height = 220, dot, onPick }: {
  series: Series[]; xMax: number; xTicks: number[]; yTicks?: number[]; fmtX: (v: number) => string; fmtY: (v: number) => string;
  markers?: Marker[]; height?: number; dot?: { x: number; y: number; label: string } | null;
  onPick?: (x: number) => void;   // click or drag on the chart to choose an x
}) {
  const [hx, setHx] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const { ref, w } = useWidth<HTMLDivElement>();
  const pad = { l: 40, r: 12, t: markers.length ? 26 : 8, b: 24 };
  const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
  const yMax = yTicks[yTicks.length - 1];
  const X = (v: number) => pad.l + (v / xMax) * iw;
  const Y = (v: number) => pad.t + ih - (v / yMax) * ih;
  const legend = series.length > 1;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {legend && (
        <Key style={{ marginBottom: 8 }} items={series.map((s) => ({ label: s.label, color: s.main ? 'var(--accent-ink)' : 'var(--muted)' }))} />
      )}
      <svg className="chart" width={w} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}
        style={{ cursor: onPick ? 'pointer' : 'crosshair', touchAction: onPick ? 'none' : undefined }}
        onPointerMove={(e) => {
          const x = Math.min(xMax, Math.max(0, ((e.clientX - e.currentTarget.getBoundingClientRect().left - pad.l) / iw) * xMax));
          setHx(x);
          if (onPick && e.buttons === 1) onPick(x);
        }}
        onPointerDown={(e) => { if (!onPick) return; e.currentTarget.setPointerCapture(e.pointerId); onPick(Math.min(xMax, Math.max(0, ((e.clientX - e.currentTarget.getBoundingClientRect().left - pad.l) / iw) * xMax))); }}
        onPointerLeave={() => setHx(null)}>
        {yTicks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} />
            <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" className="num">{fmtY(t)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t} x={X(t)} y={height - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="num">{fmtX(t)}</text>
        ))}
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={X(m.x)} x2={X(m.x)} y1={pad.t - 6} y2={pad.t + ih} stroke={m.strong ? '#1F3A5F' : '#A3ACB9'} strokeDasharray={m.strong ? undefined : '3 3'} />
            <text x={X(m.x) + (X(m.x) > w - 120 ? -6 : 6)} y={pad.t - 10} textAnchor={X(m.x) > w - 120 ? 'end' : 'start'} style={{ fill: m.strong ? '#1F3A5F' : undefined }}>{m.label}</text>
          </g>
        ))}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
          return (
            // pathLength=1 normalises the path, so a dash offset of 1 -> 0 draws it in once
            <motion.path key={s.label} d={d} fill="none" stroke={s.main ? '#E4572E' : '#A3ACB9'} strokeWidth={s.main ? 2.5 : 1.5}
              pathLength={1} strokeDasharray="1 1"
              initial={reduce ? false : { strokeDashoffset: 1 }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
          );
        })}
        {hx != null && (
          <g pointerEvents="none">
            <line x1={X(hx)} x2={X(hx)} y1={pad.t} y2={pad.t + ih} stroke="#1E2A38" strokeOpacity={0.25} />
            {series.map((s) => <circle key={s.label} cx={X(hx)} cy={Y(valueAt(s.points, hx))} r={3.5} fill={s.main ? '#E4572E' : '#A3ACB9'} />)}
          </g>
        )}
        {dot && (
          <g pointerEvents="none">
            <circle cx={X(dot.x)} cy={Y(dot.y)} r={5} fill="#1F3A5F" />
            <text x={X(dot.x) + (X(dot.x) > w - 140 ? -10 : 10)} y={Y(dot.y) + 18} textAnchor={X(dot.x) > w - 140 ? 'end' : 'start'} style={{ fill: '#1F3A5F' }}>{dot.label}</text>
          </g>
        )}
      </svg>
      {hx != null && (
        <div className="chart-tip" style={{ left: X(hx), top: pad.t + 30 }}>
          <b>{fmtX(Math.round(hx))}</b>{series.map((sr) => <span key={sr.label}><br />{sr.label}: {fmtY(valueAt(sr.points, hx))}</span>)}
          {onPick && <><br /><span style={{ opacity: 0.7 }}>Klik untuk memilih titik ini</span></>}
        </div>
      )}
    </div>
  );
}

/** Columns per day; the bars for the chosen window carry the hue, the rest are grey. */
export function DayBars({ data, hot, height = 200, fmtY, cliff }: {
  data: { day: number; rate: number | null; n: number }[]; hot: (day: number) => boolean; height?: number; fmtY: (v: number) => string;
  /** day to mark as the cliff: shades the window before it and labels the average rate on each side */
  cliff?: number;
}) {
  const reduce = useReducedMotion();
  const { ref, w } = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<number | null>(null);
  const pad = { l: 40, r: 8, t: cliff == null ? 8 : 52, b: 24 };
  const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const bw = iw / data.length;
  const Y = (v: number) => pad.t + ih - v * ih;
  const shown = useMemo(() => data.filter((d) => d.day % 7 === 0), [data]);
  const t = tip == null ? null : data.find((d) => d.day === tip);
  const avg = (f: (d: number) => boolean) => {
    const g = data.filter((d) => d.rate != null && f(d.day));
    const n = g.reduce((a, d) => a + d.n, 0);
    return n ? g.reduce((a, d) => a + (d.rate ?? 0) * d.n, 0) / n : 0;
  };
  const cx = cliff == null ? 0 : pad.l + (data.findIndex((d) => d.day > cliff) < 0 ? data.length : data.findIndex((d) => d.day > cliff)) * bw;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={w} height={height} role="img" aria-label="Risiko menurut hari terakhir aktif" onMouseLeave={() => setTip(null)}>
        {cliff != null && w > 0 && (
          <g className="cliff">
            <rect x={pad.l} y={0} width={cx - pad.l} height={pad.t + ih} fill="#E4572E" opacity={0.07} />
            <line x1={cx} x2={cx} y1={0} y2={pad.t + ih} stroke="#E4572E" strokeDasharray="4 4" />
            <text x={pad.l + 10} y={20} className="cliff-big" fill="#B8401F">{fmtY(avg((d) => d <= cliff))} gagal</text>
            <text x={pad.l + 10} y={38} className="cliff-sub">terakhir aktif hari 0–{cliff}</text>
            <text x={cx + 10} y={20} className="cliff-big" fill="#1F3A5F">{fmtY(avg((d) => d > cliff))} gagal</text>
            <text x={cx + 10} y={38} className="cliff-sub">masih aktif setelah hari ke-{cliff}</text>
          </g>
        )}
        {ticks.map((v) => (
          <g key={v}><line className="gridline" x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} /><text x={pad.l - 8} y={Y(v) + 4} textAnchor="end" className="num">{fmtY(v)}</text></g>
        ))}
        {data.map((d, i) => d.rate == null ? null : (
          <motion.rect key={d.day} x={pad.l + i * bw + bw * 0.3} width={Math.max(1, bw * 0.4)} y={Y(d.rate)} height={ih - (Y(d.rate) - pad.t)} rx={2}
            fill={hot(d.day) ? '#E4572E' : '#CFCBC2'} onMouseEnter={() => setTip(d.day)}
            initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} style={{ transformOrigin: `0 ${pad.t + ih}px` }}
            transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.012, ease: [0.22, 1, 0.36, 1] }} />
        ))}
        <line className="baseline" x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} />
        {shown.map((d) => (
          <text key={d.day} x={pad.l + data.findIndex((x) => x.day === d.day) * bw + bw / 2} y={height - 6} textAnchor="middle" className="num">Hari {d.day}</text>
        ))}
      </svg>
      {t && (
        <div className="chart-tip" style={{ left: pad.l + data.indexOf(t) * bw, top: 40 }}>
          Terakhir aktif hari {t.day}: {fmtY(t.rate ?? 0)} berisiko · {t.n.toLocaleString('id-ID')} mhs
        </div>
      )}
    </div>
  );
}
