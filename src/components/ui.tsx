'use client';
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { Tier } from '@/lib/data';
import { TIER_LABEL } from '@/lib/data';

export function TierPill({ tier }: { tier: Tier }) {
  return <span className={`pill tier-${tier}`}>{TIER_LABEL[tier]}</span>;
}

/** Counts up once to its value; prints the final value straight away under reduced motion. */
export function Counter({ value, format = (v: number) => Math.round(v).toLocaleString('id-ID') }: {
  value: number; format?: (v: number) => string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (reduce) { ref.current.textContent = format(value); return; }
    const c = animate(0, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = format(v); } });
    return () => c.stop();
  }, [value, reduce, format]);
  return <span ref={ref} className="num">{format(value)}</span>;
}

/** Half-ring gauge for one probability; the needle springs to new values. */
export function Gauge({ p, size = 220, label }: { p: number; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(p);
  const spring = useSpring(mv, { stiffness: 140, damping: 22 });
  useEffect(() => { mv.set(p); }, [p, mv]);
  const v = reduce ? mv : spring;
  const r = size / 2 - 14;
  const arcLen = Math.PI * r;
  const dash = useTransform(v, (x) => `${Math.max(0.001, x) * arcLen} ${arcLen}`);
  const [txt, setTxt] = useState(Math.round(p * 100));
  useEffect(() => v.on('change', (x) => setTxt(Math.round(x * 100))), [v]);
  const cx = size / 2, cy = size / 2;
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg width={size} height={size / 2 + 26} viewBox={`0 0 ${size} ${size / 2 + 26}`} role="img" aria-label={`Risiko ${Math.round(p * 100)} persen`}>
      <path d={path} stroke="#E2DFD8" strokeWidth="8" fill="none" strokeLinecap="round" />
      <motion.path d={path} stroke="#E4572E" strokeWidth="8" fill="none" strokeLinecap="round" style={{ strokeDasharray: dash }} />
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#1E2A38" fontSize="52" fontWeight="400" className="num" style={{ letterSpacing: '-0.02em', fontFamily: 'var(--font-serif), Georgia, serif' }}>{txt}%</text>
      {label && <text x={cx} y={cy + 20} textAnchor="middle" fill="#7A8494" fontSize="12">{label}</text>}
    </svg>
  );
}

/** Thin bar whose fill grows once to its true ratio. */
export function Bar({ value, grey = false }: { value: number; grey?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="bar-track">
      <motion.div className={`bar-fill${grey ? ' grey' : ''}`}
        initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Loading({ h = 200 }: { h?: number }) {
  return <div style={{ height: h, background: 'var(--raised)', borderRadius: 12, opacity: 0.5 }} aria-label="Memuat" />;
}

export function Failed({ what }: { what: string }) {
  return <p className="notice">Data {what} tidak bisa dimuat. Muat ulang halaman.</p>;
}

/** Chart key written as one sentence, each series named in its own colour: no bullet dots. */
export function Key({ items, join = 'dibanding', style }: { items: { label: string; color: string }[]; join?: string; style?: React.CSSProperties }) {
  return (
    <p className="key" style={style}>
      {items.map((it, i) => (
        <span key={it.label}>{i > 0 && ` ${join} `}<b style={{ color: it.color }}>{i === 0 ? it.label : it.label.charAt(0).toLowerCase() + it.label.slice(1)}</b></span>
      ))}.
    </p>
  );
}
