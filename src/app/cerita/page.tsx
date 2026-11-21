'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useData, type CapacityPoint, type Signal, type Student, type Summary } from '@/lib/data';
import { CHAPTERS, scrollRange, story } from '@/lib/story';
import { Mark } from '@/components/Shell';
import './cerita.css';

const Story = dynamic(() => import('@/components/Story'), { ssr: false });
const SPEEDS = [0.5, 1, 2];

// Chapter rail (like Cosmic) and the auto-scroll controls read/write the shared `story` state.
function Rail({ ready }: { ready: boolean }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setActive(Math.round(story.offset * (CHAPTERS.length - 1)));
      setPlaying(story.playing);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  const go = (i: number) => {
    const el = story.el;
    if (el) el.scrollTo({ top: (i / (CHAPTERS.length - 1)) * scrollRange(el), behavior: 'smooth' });
  };
  const toggle = () => {
    const el = story.el;
    if (!story.playing && el && el.scrollTop >= scrollRange(el) - 2) el.scrollTop = 0; // replay from the start
    story.playing = !story.playing;
  };
  if (!ready) return null;
  return (
    <>
      <nav className="story-rail" aria-label="Bab">
        {CHAPTERS.map((c, i) => (
          <button key={c} aria-current={i === active ? 'step' : undefined} onClick={() => go(i)}>
            <i /> <span className="num">{String(i + 1).padStart(2, '0')}</span> <span className="lbl">{c}</span>
          </button>
        ))}
      </nav>
      <div className="story-player" role="group" aria-label="Putar otomatis">
        <button className="play" onClick={toggle} aria-label={playing ? 'Jeda' : 'Putar otomatis'}>
          {playing
            ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>}
          {playing ? 'Jeda' : 'Putar'}
        </button>
        {SPEEDS.map((v) => (
          <button key={v} className="spd" aria-pressed={speed === v} onClick={() => { story.speed = v; setSpeed(v); }}>{v}×</button>
        ))}
      </div>
    </>
  );
}

export default function Cerita() {
  const { data: students, error: e1 } = useData<Student[]>('students');
  const { data: s, error: e2 } = useData<Summary>('summary');
  const { data: sig, error: e3 } = useData<Record<string, Signal>>('signals');
  const { data: cap, error: e4 } = useData<CapacityPoint[]>('capacity');
  const ready = !!(students && s && sig && cap);
  const failed = e1 || e2 || e3 || e4;
  return (
    <main className="story">
      <header className="story-bar">
        <Link href="/cerita" className="story-brand"><Mark /> Gradly</Link>
        <nav>
          <Link href="/cerita" aria-current="page">Cerita</Link>
          <Link href="/">Dashboard</Link>
        </nav>
      </header>
      <div id="story-hud" className="story-hud" aria-live="off" />
      <Rail ready={ready} />
      {failed && <p className="story-loading">Data tidak bisa dimuat. Muat ulang halaman.</p>}
      {!failed && !ready && <p className="story-loading">Menyiapkan 6.502 mahasiswa…</p>}
      {ready && students && s && sig && cap && (
        <Story
          students={students}
          capacity={cap}
          stats={{
            n: s.nTest, flagged: s.flagged, tiers: s.tiers, baseRate: s.baseRate,
            dayZero: s.insights.dayZero, late14: s.insights.lateStart14,
            vanished14: s.insights.vanished14, vanished14N: s.vanished14,
            nosub: s.nosub, nosubRate: sig.nosub.rate, ghost: s.ghost, ghostRate: s.insights.ghost,
            repeaters: students.filter((x) => x.att > 0).length,
            prevNoScore: s.jejakRates.prevNoScore, prevScore: s.jejakRates.prevScore,
          }}
        />
      )}
    </main>
  );
}
