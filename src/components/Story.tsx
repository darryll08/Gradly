'use client';
// "28 Hari Pertama" — scroll-driven 3D story, 10 chapters.
// One fixed canvas; scroll progress drives the semester day, the camera, the light and the crowd.
// Each test student is one instanced figure. Chapters 0-3 play on the 28-day road (students start
// walking on their first active day and stop on their last). From chapter 4 the same figures leave
// the road and regroup into formations (twin accounts, repeaters, tiers, ranked queue, IMD bars),
// so every number on screen is literally the crowd rearranged.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, ScrollControls, useScroll } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Link from 'next/link';
import type { CapacityPoint, Student, Tier } from '@/lib/data';
import { CHAPTERS, scrollRange, story } from '@/lib/story';

const PAGES = CHAPTERS.length;
const DAY = 1.3;            // world units per semester day
const CLIFF = 14;           // the day the story is about
const TASK = 21;            // where the "first assignment" checkpoint stands on the road (visual only)
const LANES = 2.2;          // half width of the road
const PX = 52;              // centre of the plaza where the formations stand
const SP = 0.17;            // spacing between figures in a formation
const LAYER = 0.26;         // height of one layer in a bar
const PER_COUNSELOR = 80;   // students one counselor can follow up in a semester
const INK = '#1F3A5F', CORAL = '#E4572E', STOP = '#8C8781', FADE = '#C9C1B6';
const TIERS: Tier[] = ['merah', 'oranye', 'kuning', 'hijau'];
const TIER_NAME: Record<Tier, string> = { merah: 'Kritis', oranye: 'Tinggi', kuning: 'Sedang', hijau: 'Aman' };
const TIER_HEX: Record<Tier, string> = { merah: '#E4572E', oranye: '#F39A7B', kuning: '#E9C29A', hijau: '#1F9D8B' };
const IMD = ['0-10%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'];

// One colour world per chapter (sky, ground, road, hills, sun), blended as you scroll.
const WORLDS = [
  { sky: '#F7DCCB', ground: '#F1CDB8', road: '#E9B89A', hill: '#C98F86', sun: '#FFF1D6' }, // fajar
  { sky: '#DCEFE3', ground: '#CFE6D6', road: '#B8D8C2', hill: '#7FB59A', sun: '#FFFBEA' }, // pagi
  { sky: '#FBE3A8', ground: '#F4D48C', road: '#E8BE64', hill: '#D98B3C', sun: '#FFF4CF' }, // siang, hari ke-14
  { sky: '#F6D2B8', ground: '#EEC3A4', road: '#E2AD88', hill: '#BF7F62', sun: '#FFEBD6' }, // sore, tugas
  { sky: '#DCD8EC', ground: '#CFCAE3', road: '#BDB7D6', hill: '#8C85B0', sun: '#F4F0FF' }, // lembayung, akun kembar
  { sky: '#D7EDEA', ground: '#C6E3DF', road: '#AED4CE', hill: '#6FAEA6', sun: '#F1FFFC' }, // mint, mengulang
  { sky: '#F3EEE6', ground: '#E8E1D6', road: '#DAD1C4', hill: '#A99D8C', sun: '#FFFFFF' }, // kertas, penyortiran
  { sky: '#D9E4F2', ground: '#C9D7EA', road: '#B3C5DE', hill: '#7890B3', sun: '#F4F8FF' }, // biru, kapasitas
  { sky: '#F4E2C8', ground: '#EBD3B2', road: '#DDBF97', hill: '#B58E62', sun: '#FFF3DE' }, // pasir, kesenjangan
  { sky: '#F7DCCB', ground: '#F1CDB8', road: '#E9B89A', hill: '#C98F86', sun: '#FFF1D6' }, // fajar lagi
].map((w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, new THREE.Color(v)])) as Record<keyof typeof w, THREE.Color>);

const smooth = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

// One timeline for everything. Each chapter is a HOLD (text visible, camera framed) and the
// space between chapters is a TRAVEL (text gone, camera moves). Text and camera share these windows,
// so the camera never moves while words are on screen.
const HOLD = 0.3;                                          // |distance from chapter centre| where text is fully gone
const DAYS = [0, 4, 14.5, TASK, 28, 28, 28, 28, 28, 28];   // semester day shown in each chapter
const ROAD = 4;                                            // chapters before this play on the road
function beat(t: number) {
  const p = Math.min(PAGES - 1, Math.max(0, t * (PAGES - 1)));
  const i = Math.min(PAGES - 2, Math.floor(p));
  return { i, w: smooth(HOLD, 1 - HOLD, p - i) };   // w: 0 during chapter i's hold, 1 during i+1's
}
function dayAt(t: number) {
  const { i, w } = beat(t);
  return DAYS[i] + (DAYS[i + 1] - DAYS[i]) * w;
}
// how visible chapter c is right now (1 in its hold, 0 once the camera travels)
const presence = (c: number) => 1 - smooth(HOLD * 0.5, HOLD, Math.abs(story.offset * (PAGES - 1) - c));

// 1 while the story is on the road, 0 once it has left for the plaza
const onRoad = () => 1 - smooth(ROAD - 1 + HOLD * 0.5, ROAD - 1 + HOLD, story.offset * (PAGES - 1));

// figure k of a bar standing at (gx, gz): fills a cx x cz footprint, then the next layer up
function bar(k: number, gx: number, gz: number, out: Float32Array, o: number, cx = 10, cz = 8) {
  out[o] = gx + ((k % cx) - (cx - 1) / 2) * SP;
  out[o + 1] = 0.14 + Math.floor(k / (cx * cz)) * LAYER;
  out[o + 2] = gz + ((Math.floor(k / cx) % cz) - (cz - 1) / 2) * SP;
}
const barTop = (n: number, perLayer = 80) => 0.14 + Math.ceil(n / perLayer) * LAYER;
const IMD_GAP = 1.7;   // the IMD bars are thin (6 x 4 per layer) so their heights read as a chart

type Layout = {
  spot: { z: number; lag: number; bob: number }[];
  F: (Float32Array | null)[];          // fixed formation per chapter, null = on the road
  rank: Int32Array;                    // 0 = highest predicted risk
  imd: { group: string; n: number; flagged: number }[];
};

function useLayout(students: Student[]): Layout {
  return useMemo(() => {
    const n = students.length;
    // stable pseudo-random spot per student; sums of three uniforms give a rounded, dense-centre crowd
    const spot = students.map((_, i) => {
      const r = (k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
      const z = ((r(1) + r(2) + r(3)) / 3 * 2 - 1) * LANES * 1.25;
      const lag = Math.abs((r(4) + r(5) + r(6)) / 3 * 2 - 1) * 9;
      return { z: Math.max(-LANES, Math.min(LANES, z)), lag, bob: r(7) * 6.28 };
    });
    const order = students.map((_, i) => i).sort((a, b) => students[b].p - students[a].p);
    const rank = new Int32Array(n);
    order.forEach((i, r) => { rank[i] = r; });
    const onRoad = (i: number, out: Float32Array) => {
      out[i * 3] = Math.min(28, students[i].last) * DAY - spot[i].lag;
      out[i * 3 + 1] = 0.14;
      out[i * 3 + 2] = spot[i].z;
    };
    const F: (Float32Array | null)[] = Array(PAGES).fill(null);

    // 4: twin accounts snap into one perfectly regular grid; the rest wait at the end of the road
    const f4 = new Float32Array(n * 3);
    let g = 0;
    students.forEach((s, i) => {
      if (!s.ghost) return onRoad(i, f4);
      const cols = 31;
      f4[i * 3] = PX + ((g % cols) - (cols - 1) / 2) * 0.2;
      f4[i * 3 + 1] = 0.14;
      f4[i * 3 + 2] = (Math.floor(g / cols) - 15) * 0.2;
      g++;
    });
    F[4] = f4;

    // 5: students repeating the module walk a loop back to the start
    const f5 = new Float32Array(n * 3);
    const reps = students.filter((s) => s.att > 0).length;
    let q = 0;
    students.forEach((s, i) => {
      if (s.att === 0) return onRoad(i, f5);
      const ring = q % 6, a = (Math.floor(q / 6) / Math.ceil(reps / 6)) * Math.PI * 2, r = 2.2 + ring * 0.24;
      f5[i * 3] = PX + Math.cos(a) * r;
      f5[i * 3 + 1] = 0.14;
      f5[i * 3 + 2] = Math.sin(a) * r;
      q++;
    });
    F[5] = f5;

    // 6: four tier bars, highest risk first
    const f6 = new Float32Array(n * 3);
    const seen: Record<string, number> = {};
    order.forEach((i) => {
      const t = students[i].tier, k = (seen[t] = (seen[t] ?? -1) + 1);
      bar(k, PX + (TIERS.indexOf(t) - 1.5) * 2.4, 0, f6, i * 3);
    });
    F[6] = f6;

    // 7 and 9: one queue ordered by predicted risk, the riskiest in the front row
    const f7 = new Float32Array(n * 3);
    const cols = 90, rows = Math.ceil(n / cols);
    students.forEach((_, i) => {
      const r = rank[i];
      f7[i * 3] = PX + ((r % cols) - (cols - 1) / 2) * SP;
      f7[i * 3 + 1] = 0.14;
      f7[i * 3 + 2] = ((rows - 1) / 2 - Math.floor(r / cols)) * SP;
    });
    F[7] = f7;

    // 9: the crowd forms the Gradly mark (mortarboard + tassel), riskiest students in the tassel ball
    const inMark = (x: number, y: number) =>
      (x - 37) ** 2 + (y - 31) ** 2 <= 9 ? 0
      : Math.abs(x - 37) <= 0.9 && y >= 22.5 && y <= 28 ? 1
      : Math.abs(x - 24) / 15 + Math.abs(y - 22) / 7 <= 1 ? 2
      : x >= 15 && x <= 33 && y >= 25.5 + (1 - Math.abs(x - 24) / 9) * 4.6 && y <= 35 - ((x - 24) / 9) ** 2 * 4.3 ? 3 : -1;
    let step = 0.4, pts: [number, number, number][] = [];
    for (let t = 0; t < 40; t++) {   // shrink the grid until every student has a spot
      pts = [];
      for (let y = 14; y <= 35; y += step) for (let x = 8; x <= 41; x += step) { const part = inMark(x, y); if (part >= 0) pts.push([part, x, y]); }
      if (pts.length >= n) break;
      step *= 0.97;
    }
    pts.sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1] - q[1]);
    const S = (SP * 0.7) / step;
    const f9 = new Float32Array(n * 3);
    students.forEach((_, i) => {
      const [, x, y] = pts[rank[i]];
      f9[i * 3] = PX + (x - 25) * S;
      f9[i * 3 + 1] = 0.14;
      f9[i * 3 + 2] = (y - 25) * S * 1.5;   // stretched along depth so the low camera still reads it as the logo
    });
    F[9] = f9;

    // 8: one bar per deprivation decile (poorest left), flagged students at the bottom; unknown IMD waits behind
    const f8 = new Float32Array(n * 3);
    const cnt: Record<string, number> = {};
    const flaggedFirst = students.map((_, i) => i).sort((a, b) => students[b].pred - students[a].pred);
    let u = 0;
    flaggedFirst.forEach((i) => {
      const gi = IMD.indexOf(students[i].imd);
      if (gi < 0) {
        f8[i * 3] = PX + ((u % 60) - 29.5) * SP; f8[i * 3 + 1] = 0.14; f8[i * 3 + 2] = -14 - Math.floor(u / 60) * SP; u++;
        return;
      }
      const k = (cnt[students[i].imd] = (cnt[students[i].imd] ?? -1) + 1);
      bar(k, PX + (gi - 4) * IMD_GAP, 0, f8, i * 3, 6, 4);
    });
    F[8] = f8;
    const imd = IMD.map((group) => {
      const g2 = students.filter((s) => s.imd === group);
      return { group, n: g2.length, flagged: g2.filter((s) => s.pred === 1).length };
    });
    return { spot, F, rank, imd };
  }, [students]);
}

function Palette({ mats }: { mats: React.RefObject<Record<string, THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | null>> }) {
  const { scene } = useThree();
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const p = story.offset * (PAGES - 1);
    const i = Math.min(PAGES - 2, Math.floor(p));
    const f = smooth(0, 1, p - i);
    const mix = (k: 'sky' | 'ground' | 'road' | 'hill' | 'sun') => tmp.copy(WORLDS[i][k]).lerp(WORLDS[i + 1][k], f);
    (scene.background as THREE.Color).copy(mix('sky'));
    scene.fog?.color.copy(mix('sky'));
    for (const k of ['ground', 'road', 'hill', 'sun'] as const) mats.current?.[k]?.color.copy(mix(k));
  });
  return null;
}

function Crowd({ students, layout }: { students: Student[]; layout: Layout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const C = useMemo(() => ({
    ink: new THREE.Color(INK), coral: new THREE.Color(CORAL), grey: new THREE.Color(STOP), fade: new THREE.Color(FADE),
    tier: Object.fromEntries(TIERS.map((t) => [t, new THREE.Color(TIER_HEX[t])])) as Record<Tier, THREE.Color>,
  }), []);
  const ca = useMemo(() => new THREE.Color(), []);
  const cb = useMemo(() => new THREE.Color(), []);
  const waiting = useMemo(() => new THREE.Color(), []);
  const pa = useMemo(() => new Float32Array(3), []);
  const pb = useMemo(() => new Float32Array(3), []);
  const { spot, F, rank } = layout;

  // colour of student i in chapter c (day only matters on the road)
  const colour = (c: number, i: number, day: number, out: THREE.Color) => {
    const s = students[i];
    if (c < 3) {
      if (day > s.last) return out.copy(C.grey);
      if (day >= s.first) return out.copy(s.pred === 1 ? C.coral : C.ink);
      return out.copy(waiting.copy(s.pred === 1 ? C.coral : C.ink).lerp(C.grey, 0.55));
    }
    if (c === 3) return out.copy(s.nosub ? C.coral : C.fade);
    if (c === 4) return out.copy(s.ghost ? C.coral : C.fade);
    if (c === 5) return out.copy(s.att > 0 ? C.coral : C.fade);
    if (c === 6) return out.copy(C.tier[s.tier]);
    if (c === 7) return out.copy(rank[i] < story.capacity ? C.coral : C.fade);
    return out.copy(s.pred === 1 ? C.coral : C.ink);
  };
  // position of student i in chapter c
  const place = (c: number, i: number, day: number, out: Float32Array) => {
    const f = F[c];
    if (f) { out[0] = f[i * 3]; out[1] = f[i * 3 + 1]; out[2] = f[i * 3 + 2]; return; }
    const s = students[i], { z, lag } = spot[i];
    out[0] = day >= s.first ? Math.min(day, s.last) * DAY - lag : -2.4 - lag * 0.5;
    out[1] = 0.14;
    out[2] = z;
  };

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const { i: c, w } = beat(story.offset);
    const day = dayAt(story.offset);
    const tt = clock.elapsedTime;
    const bothRoad = c + 1 < ROAD;
    for (let i = 0; i < students.length; i++) {
      const s = students[i], { lag, bob } = spot[i];
      // figures leave one formation a little apart from each other, so the crowd flows instead of sliding as a block
      const wi = bothRoad ? w : smooth(0, 1, w * 1.6 - (lag / 9) * 0.6);
      if (bothRoad) { place(c, i, day, pa); dummy.position.set(pa[0], pa[1], pa[2]); }
      else {
        place(c, i, DAYS[c], pa); place(c + 1, i, DAYS[c + 1], pb);
        const moved = Math.abs(pa[0] - pb[0]) + Math.abs(pa[2] - pb[2]) > 0.01;
        dummy.position.set(pa[0] + (pb[0] - pa[0]) * wi, pa[1] + (pb[1] - pa[1]) * wi + (moved ? Math.sin(Math.PI * wi) * 1.2 : 0), pa[2] + (pb[2] - pa[2]) * wi);
      }
      const walking = c < ROAD - 1 && day >= s.first && day <= s.last && day > 0.05;
      if (walking) dummy.position.y += Math.abs(Math.sin(tt * 8 + bob)) * 0.03;
      dummy.scale.setScalar(c < ROAD && day > s.last && wi < 0.5 ? 0.8 : 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      colour(c, i, bothRoad ? day : DAYS[c], ca);
      colour(c + 1, i, bothRoad ? day : DAYS[c + 1], cb);
      m.setColorAt(i, ca.lerp(cb, bothRoad ? 0 : wi));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, students.length]} frustumCulled={false}>
      <capsuleGeometry args={[0.05, 0.14, 2, 6]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

// A low-poly student with a backpack, built from primitives (no model file to download).
function Walker() {
  const g = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const last = useRef(0);
  const phase = useRef(0);
  useFrame((_, dt) => {
    const day = dayAt(story.offset);
    const moving = Math.abs(day - last.current) > 1e-4;
    last.current = day;
    if (moving) phase.current += dt * 9;
    const swing = moving ? Math.sin(phase.current) * 0.6 : 0;
    if (legL.current) legL.current.rotation.z = swing;
    if (legR.current) legR.current.rotation.z = -swing;
    if (g.current) {
      g.current.visible = onRoad() > 0;
      g.current.position.x = THREE.MathUtils.damp(g.current.position.x, day * DAY + 1.4, 10, dt);
      g.current.position.y = moving ? Math.abs(Math.sin(phase.current)) * 0.05 : 0;
    }
  });
  return (
    <group ref={g} position={[1.4, 0, 0.2]}>
      <mesh position={[0, 0.95, 0]}><capsuleGeometry args={[0.22, 0.42, 4, 8]} /><meshLambertMaterial color={INK} /></mesh>
      <mesh position={[0, 1.52, 0]}><sphereGeometry args={[0.2, 12, 10]} /><meshLambertMaterial color="#F2C9A6" /></mesh>
      <mesh position={[-0.27, 1.0, 0]}><boxGeometry args={[0.2, 0.42, 0.36]} /><meshLambertMaterial color={CORAL} /></mesh>
      <mesh ref={legL} position={[0, 0.5, 0.1]}><capsuleGeometry args={[0.08, 0.38, 3, 6]} /><meshLambertMaterial color="#2B2F36" /></mesh>
      <mesh ref={legR} position={[0, 0.5, -0.1]}><capsuleGeometry args={[0.08, 0.38, 3, 6]} /><meshLambertMaterial color="#2B2F36" /></mesh>
    </group>
  );
}

// Road props (gates, day posts) step aside once the story moves to the plaza, so they never cut through a chart.
function RoadOnly({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => { if (g.current) g.current.visible = onRoad() > 0; });
  return <group ref={g}>{children}</group>;
}

type Marks = React.RefObject<HTMLDivElement | null>;
// A label in the 3D scene that only shows while its chapter is on screen (no chapter = only while on the road).
// Portalled outside the scroller: by default drei puts Html inside it, where off-screen labels stretch the scroll area.
function Label({ at, ch, layer, children, className = 'story-mark' }: { at: [number, number, number]; ch?: number; layer: Marks; children: React.ReactNode; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  useFrame(() => {
    if (!el.current) return;
    const o = ch === undefined ? onRoad() : presence(ch);
    el.current.style.opacity = String(o);
    el.current.style.visibility = o < 0.02 ? 'hidden' : 'visible';
  });
  return (
    <Html position={at} center zIndexRange={[1, 0]} portal={layer as React.RefObject<HTMLElement>}>
      <div ref={el} className={className}>{children}</div>
    </Html>
  );
}

function World({ mats, marks, layout, tiers }: {
  mats: React.RefObject<Record<string, THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | null>>; marks: Marks; layout: Layout; tiers: Record<Tier, number>;
}) {
  const set = (k: string) => (m: THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | null) => { if (mats.current) mats.current[k] = m; };
  // one shared material per surface, so Palette recolours every hill / road piece in one write
  const roadMat = useMemo(() => new THREE.MeshBasicMaterial(), []);
  const hillMat = useMemo(() => new THREE.MeshLambertMaterial({ flatShading: true }), []);
  if (mats.current) { mats.current.road = roadMat; mats.current.hill = hillMat; }
  const hills = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    x: -24 + i * 6 + Math.sin(i * 3.1) * 2, z: -32 - Math.abs(Math.sin(i * 1.7)) * 10, r: 5 + Math.abs(Math.sin(i * 2.3)) * 5, h: 4 + Math.abs(Math.cos(i * 1.3)) * 6,
  })), []);
  const days = [0, 7, 14, 21, 28];
  const roadW = LANES * 2 + 0.6;
  const end = 28 * DAY + 0.35;   // where the second road piece stops
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[30, -0.02, 0]}>
        <planeGeometry args={[200, 90]} />
        <meshBasicMaterial ref={set('ground')} />
      </mesh>
      {/* the sun sits low behind the road; a hill line gives each world a horizon */}
      <mesh position={[36, 14, -60]}><circleGeometry args={[7, 48]} /><meshBasicMaterial ref={set('sun')} fog={false} /></mesh>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, h.h / 2 - 0.1, h.z]} material={hillMat}><coneGeometry args={[h.r, h.h, 5]} /></mesh>
      ))}
      {/* road, split by the day-14 gap, then a path into the plaza */}
      <mesh position={[(CLIFF * DAY - 2) / 2, 0, 0]} material={roadMat}><boxGeometry args={[CLIFF * DAY + 2, 0.04, roadW]} /></mesh>
      <mesh position={[CLIFF * DAY + 0.35 + (28 - CLIFF) * DAY / 2, 0, 0]} material={roadMat}><boxGeometry args={[(28 - CLIFF) * DAY, 0.04, roadW]} /></mesh>
      <mesh position={[(end + PX - 9) / 2, 0, 0]} material={roadMat}><boxGeometry args={[PX - 9 - end, 0.04, 1.4]} /></mesh>
      <mesh position={[PX, 0, 0]} rotation-x={-Math.PI / 2} material={roadMat}><circleGeometry args={[10, 64]} /></mesh>
      <RoadOnly>
      <mesh position={[CLIFF * DAY + 0.15, -0.6, 0]}><boxGeometry args={[0.3, 1.2, roadW]} /><meshLambertMaterial color={CORAL} /></mesh>
      {/* entrance gate */}
      <mesh position={[-1.6, 1.2, -LANES - 0.5]}><boxGeometry args={[0.3, 2.4, 0.3]} /><meshLambertMaterial color={INK} /></mesh>
      <mesh position={[-1.6, 1.2, LANES + 0.5]}><boxGeometry args={[0.3, 2.4, 0.3]} /><meshLambertMaterial color={INK} /></mesh>
      <mesh position={[-1.6, 2.5, 0]}><boxGeometry args={[0.3, 0.3, LANES * 2 + 1.3]} /><meshLambertMaterial color={INK} /></mesh>
      {/* first-assignment checkpoint */}
      <mesh position={[TASK * DAY, 1.2, -LANES - 0.5]}><boxGeometry args={[0.24, 2.4, 0.24]} /><meshLambertMaterial color={CORAL} /></mesh>
      <mesh position={[TASK * DAY, 1.2, LANES + 0.5]}><boxGeometry args={[0.24, 2.4, 0.24]} /><meshLambertMaterial color={CORAL} /></mesh>
      <mesh position={[TASK * DAY, 2.45, 0]}><boxGeometry args={[0.24, 0.24, LANES * 2 + 1.2]} /><meshLambertMaterial color={CORAL} /></mesh>
      <Label at={[TASK * DAY, 3.1, -LANES - 0.5]} ch={3} layer={marks} className="story-tag">Batas tugas pertama</Label>
      {days.map((d) => (
        <group key={d} position={[d * DAY, 0, -LANES - 0.7]}>
          <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.08, 0.8, 0.08]} /><meshLambertMaterial color={d === CLIFF ? CORAL : INK} /></mesh>
          <Label at={[0, 1.05, 0]} layer={marks}>{d === 0 ? 'Hari 1' : `Hari ${d}`}</Label>
        </group>
      ))}
      </RoadOnly>
      {TIERS.map((t, k) => (
        <Label key={t} at={[PX + (k - 1.5) * 2.4, barTop(tiers[t]) + 0.6, 0]} ch={6} layer={marks} className="story-tag">
          {TIER_NAME[t]} <b>{tiers[t].toLocaleString('id-ID')}</b>
        </Label>
      ))}
      {layout.imd.map((g, k) => (
        <group key={g.group}>
          <Label at={[PX + (k - 4) * IMD_GAP, barTop(g.n, 24) + 0.45, 0]} ch={8} layer={marks} className="story-tag"><b>{Math.round((g.flagged / g.n) * 100)}%</b></Label>
          <Label at={[PX + (k - 4) * IMD_GAP, -0.3, 1]} ch={8} layer={marks}>{k === 0 ? 'Termiskin' : k === IMD.length - 1 ? 'Terkaya' : g.group}</Label>
        </group>
      ))}
    </group>
  );
}

// Camera: each chapter has one framed shot; between chapters it blends from one to the next.
function Rig() {
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const la = useMemo(() => new THREE.Vector3(), []);
  const lb = useMemo(() => new THREE.Vector3(), []);
  const sideA = useMemo(() => ({ v: 1 }), []);
  const sideB = useMemo(() => ({ v: 1 }), []);
  // the framed shot of chapter c; side = how far the image is pushed right (+) or left (-) away from the text
  const shot = (c: number, p: THREE.Vector3, l: THREE.Vector3, sd: { v: number }) => {
    const x = DAYS[c] * DAY;
    switch (c) {
      case 0: p.set(-20, 6.5, 9); l.set(-14.5, 0.5, 0); sd.v = 0; break;
      case 1: p.set(x + 9, 4.6, 9.5); l.set(x - 1.5, 0.3, 4.2); sd.v = 1; break;
      case 2: p.set(x + 9, 4.6, -9.5); l.set(x - 1.5, 0.3, -4.2); sd.v = -1; break;
      case 3: p.set(x + 8, 4.4, 8.5); l.set(x - 2, 0.6, 3.6); sd.v = 1; break;
      case 4: p.set(PX - 3, 8.5, 10); l.set(PX, 0, 0); sd.v = -1; break;
      case 5: p.set(PX, 9.5, 12); l.set(PX - 2.5, 0.2, 0); sd.v = 1; break;
      case 6: p.set(PX + 1, 6.5, 23); l.set(PX + 1, 3.2, 0); sd.v = -1; break;
      case 7: p.set(PX - 3, 19, 18); l.set(PX - 3, 0, 0); sd.v = 1; break;
      case 8: p.set(PX + 1, 6.5, 31); l.set(PX + 1, 3.6, 0); sd.v = -1; break;
      default: p.set(PX - 5, 24, 19); l.set(PX - 5, 0, 0); sd.v = 1;
    }
  };
  useFrame(({ camera }) => {
    const { i, w } = beat(story.offset);
    shot(i, a, la, sideA); shot(i + 1, b, lb, sideB);
    // no extra smoothing here: story.offset is already eased, and a second lag would let text and camera drift apart
    camera.position.copy(a).lerp(b, w);
    camera.lookAt(la.lerp(lb, w));
    // shift the whole picture to the half opposite the chapter text (film offset moves the image, not the camera)
    const cam = camera as THREE.PerspectiveCamera;
    const off = -7.5 * (sideA.v + (sideB.v - sideA.v) * w);
    if (Math.abs(cam.filmOffset - off) > 0.01) { cam.filmOffset = off; cam.updateProjectionMatrix(); }
  });
  return null;
}

// Per frame: share progress with the page, drive auto scroll, fade chapter text in and out.
function Driver() {
  const scroll = useScroll();
  const auto = useRef(0);
  useFrame((_, dt) => {
    story.el = scroll.el;
    const el = scroll.el;
    // own progress: drei caches the scroll range at mount, which drifts after a window resize (e.g. going fullscreen)
    const max = el ? scrollRange(el) : 1;
    const target = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
    story.offset += (target - story.offset) * (1 - Math.exp(-dt * 6));
    if (story.playing && el) {
      if (Math.abs(auto.current - el.scrollTop) > 2) auto.current = el.scrollTop;   // user scrolled meanwhile
      auto.current += dt * story.speed * el.clientHeight * 0.18;                    // 1x ≈ one chapter every ~5.5 s
      el.scrollTop = auto.current;
      if (auto.current >= max - 1) story.playing = false;
    }
    const hud = document.getElementById('story-hud');
    const p = story.offset * (PAGES - 1);
    if (hud) hud.textContent = p < ROAD - 0.5 ? `Hari ${Math.max(1, Math.round(dayAt(story.offset)))} / 28` : '';
    document.querySelectorAll<HTMLElement>('.chapter').forEach((c, i) => {
      const d = p - i;                                       // 0 when this chapter is centred
      const o = presence(i);                                 // fully gone before the camera starts to travel
      c.style.opacity = String(o);
      c.style.transform = `translate3d(0, ${(d * -40).toFixed(2)}px, 0)`;
      c.style.visibility = o < 0.02 ? 'hidden' : 'visible';   // hidden chapters can't catch clicks
    });
  });
  return null;
}

// Chapter 7: how many students the counselors can reach, and how many of those really need it.
function Capacity({ n, capacity, atRisk }: { n: number; capacity: CapacityPoint[]; atRisk: number }) {
  const [k, setK] = useState(10);
  const reach = Math.min(n, k * PER_COUNSELOR);
  const pt = capacity[Math.min(capacity.length, Math.max(1, Math.round((reach / n) * 100))) - 1];
  const helped = Math.round(reach * pt.precision);
  return (
    <>
      <p className="big"><b>{k}</b> konselor bisa menghubungi <b>{reach.toLocaleString('id-ID')}</b> mahasiswa paling berisiko.</p>
      <label className="story-slider">
        <span>Jumlah konselor</span>
        <input type="range" min={1} max={60} value={k} aria-label="Jumlah konselor"
          onChange={(e) => { const v = +e.target.value; setK(v); story.capacity = Math.min(n, v * PER_COUNSELOR); }} />
      </label>
      <p className="stat">{Math.round(pt.precision * 100)}% tepat sasaran, menjangkau {helped.toLocaleString('id-ID')} dari sekitar {atRisk.toLocaleString('id-ID')} yang berisiko.</p>
      <p className="act"><span>Yang dilakukan kampus</span>Tambah konselor selama masih tepat sasaran.</p>
      <p className="note">Ketepatan diukur pada data angkatan sebelumnya.</p>
    </>
  );
}

export type StoryStats = {
  n: number; flagged: number; dayZero: number; late14: number; vanished14: number; vanished14N: number;
  nosub: number; nosubRate: number; ghost: number; ghostRate: number; repeaters: number; prevNoScore: number; prevScore: number;
  tiers: Record<Tier, number>; baseRate: number;
};

export default function Story({ students, stats, capacity }: { students: Student[]; stats: StoryStats; capacity: CapacityPoint[] }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const num = (v: number) => v.toLocaleString('id-ID');
  const mats = useRef<Record<string, THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | null>>({});
  const marks = useRef<HTMLDivElement>(null);
  const layout = useLayout(students);
  const poor = layout.imd[0], rich = layout.imd[layout.imd.length - 1];
  return (
    <>
    <div ref={marks} className="story-marks" />
    <Canvas flat camera={{ position: [-20, 6.5, 9], fov: 42 }} dpr={[1, 2]} style={{ position: 'fixed', inset: 0, background: '#F7DCCB' }}
      onCreated={({ scene }) => { scene.background = new THREE.Color(WORLDS[0].sky); }}>
      <fog attach="fog" args={['#F7DCCB', 20, 75]} />
      <hemisphereLight args={['#ffffff', '#d9c2ad', 1.1]} />
      <directionalLight position={[5, 10, 6]} intensity={1.4} />
      <ScrollControls pages={PAGES} damping={0.25}>
        <World mats={mats} marks={marks} layout={layout} tiers={stats.tiers} />
        <Palette mats={mats} />
        <Crowd students={students} layout={layout} />
        <Walker />
        <Rig />
        <Driver />
      </ScrollControls>
    </Canvas>
    <div className="chapters">
        <section className="chapter">
          <h1>{num(stats.n)} mahasiswa. 28 hari.</h1>
          <p>Dari aktivitas 28 hari pertama di LMS, <b>{num(stats.flagged)}</b> diperkirakan gagal atau mundur.</p>
        </section>
        <section className="chapter">
          <h2>Hari pertama</h2>
          <p className="big">Aktif sejak hari pertama: <b>{pct(stats.dayZero)}</b> gagal. Baru muncul setelah hari ke-14: <b>{pct(stats.late14)}</b>.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Sapa yang belum aktif di minggu pertama.</p>
        </section>
        <section className="chapter right">
          <h2>Hari ke-14</h2>
          <p className="big"><b>{num(stats.vanished14N)}</b> mahasiswa berhenti aktif sebelum hari ke-14. <b>{pct(stats.vanished14)}</b> gagal.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Hubungi mereka sebelum hari ke-14.</p>
        </section>
        <section className="chapter">
          <h2>Tugas pertama</h2>
          <p className="big"><b>{num(stats.nosub)}</b> mahasiswa tidak mengumpulkan tugas pertama. <b>{pct(stats.nosubRate)}</b> gagal.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Dosen pembimbing langsung dikabari saat tenggat lewat.</p>
        </section>
        <section className="chapter right">
          <h2>Akun kembar</h2>
          <p className="big"><b>{num(stats.ghost)}</b> akun punya aktivitas yang sama persis. <b>{pct(stats.ghostRate)}</b> gagal.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Pastikan akunnya benar dipakai.</p>
        </section>
        <section className="chapter">
          <h2>Mengulang</h2>
          <p className="big"><b>{num(stats.repeaters)}</b> mahasiswa sedang mengulang. Tanpa nilai di percobaan sebelumnya: <b>{pct(stats.prevNoScore)}</b> gagal lagi.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Dampingi sejak minggu pertama.</p>
        </section>
        <section className="chapter right">
          <h2>Empat tingkat</h2>
          <p className="big">Semua tanda digabung jadi satu skor. <b>{num(stats.tiers.merah)}</b> mahasiswa kritis.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Kritis dihubungi dalam 48 jam.</p>
        </section>
        <section className="chapter">
          <h2>Kapasitas</h2>
          <Capacity n={stats.n} capacity={capacity} atRisk={Math.round(stats.n * stats.baseRate)} />
        </section>
        <section className="chapter right">
          <h2>Kesenjangan</h2>
          <p className="big">Wilayah termiskin: <b>{pct(poor.flagged / poor.n)}</b> berisiko. Wilayah terkaya: <b>{pct(rich.flagged / rich.n)}</b>.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Bagi bantuan menurut risiko, bukan rata.</p>
        </section>
        <section className="chapter end">
          <h2>Mulai sekarang</h2>
          <p>Semua tanda ini terlihat jauh sebelum ujian. Gradly mengurutkan <b>{num(stats.flagged)}</b> mahasiswa ini beserta alasannya.</p>
          <div className="story-ctas">
            <Link className="story-btn" href="/mahasiswa">Buka daftar mahasiswa</Link>
            <Link className="story-btn ghost" href="/anggaran">Hitung anggaran</Link>
          </div>
        </section>
    </div>
    </>
  );
}
