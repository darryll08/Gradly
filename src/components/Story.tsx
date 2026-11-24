'use client';
// "28 Hari Pertama" — scroll-driven 3D story, 10 chapters, in the night-city look of the deck.
// One fixed canvas; scroll progress drives the semester day, the camera and the crowd.
// Each test student is one instanced blocky figure. Chapters 0-3 play on the 28-day road (students start
// walking on their first active day and stop on their last). From chapter 4 the same figures regroup
// further down the road into formations (twin accounts, repeaters, tiers, ranked queue, IMD bars, the Gradly mark),
// so every number on screen is literally the crowd rearranged.
// The camera always looks back down the road (towards -x), so the road runs into the distance behind every shot.
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Html, ScrollControls, useScroll } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Link from 'next/link';
import type { CapacityPoint, Student, Tier } from '@/lib/data';
import { CHAPTERS, scrollRange, story } from '@/lib/story';

const PAGES = CHAPTERS.length;
const DAY = 1.3;            // world units per semester day
const CLIFF = 14;           // the day the story is about
const TASK = 21;            // where the "first assignment" gate stands on the road (visual only)
const LANES = 2.9;          // half width of the crowd on the road
const LANE_W = 0.32;        // lane spacing of the marching crowd
const ROW_D = 0.42;         // row spacing of the marching crowd
const ROAD_W = 7.6;         // road width
const ROAD_FROM = -16, ROAD_TO = 110;
const PX = 56;              // centre of the formations, further down the same road
const SP = 0.2;             // spacing between figures in a formation
const LAYER = 0.5;          // height of one layer in a bar
const FIG = 1.45;           // size of one crowd figure
const START = -11;          // the day-1 gate, behind the waiting crowd
const PER_COUNSELOR = 80;
const QUEUE_SHOWN = 2400;
const MARK_HALF = 3.3;     // half width of the Gradly mark in the last chapter: inside the road   // students of the risk queue standing on the road in the capacity chapter   // students one counselor can follow up in a semester

// night palette (from the deck)
const YELLOW = '#FFC21A', ORANGE = '#FF8A1F', SKY_BLUE = '#8CC4FF', WHITE = '#F2F4FA', FADE = '#3D4C8C', STONE = '#C7CCDD';
const GROUND = '#1B275F', ROAD = '#2B3C98', WALK = '#3A51B4', FOG = '#24378A';
const TIERS: Tier[] = ['merah', 'oranye', 'kuning', 'hijau'];
const TIER_NAME: Record<Tier, string> = { merah: 'Kritis', oranye: 'Tinggi', kuning: 'Sedang', hijau: 'Aman' };
const TIER_HEX: Record<Tier, string> = { merah: ORANGE, oranye: YELLOW, kuning: WHITE, hijau: SKY_BLUE };
const IMD = ['0-10%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'];

const smooth = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
// deterministic noise, so the city and the crowd look the same on every visit
const rnd = (i: number, k = 0) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

// Formations are laid out in "stage" coordinates (sx = left→right on screen, sz = towards the camera)
// and turned onto the road: the camera looks down -x, so screen-right is -z and "towards the camera" is +x.
const T = (sx: number, sy: number, sz: number): [number, number, number] => [PX + sz, sy, -(sx - PX)];
const setT = (v: THREE.Vector3, sx: number, sy: number, sz: number) => v.set(PX + sz, sy, -(sx - PX));

// One timeline for everything. Each chapter is a HOLD (text visible, camera framed) and the
// space between chapters is a TRAVEL (text gone, camera moves). Text and camera share these windows,
// so the camera never moves while words are on screen.
const HOLD = 0.3;                                          // |distance from chapter centre| where text is fully gone
const DAYS = [0, 4, 14.5, TASK, 28, 28, 28, 28, 28, 28];   // semester day shown in each chapter
const ROAD_CH = 4;                                         // chapters before this play on the road
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

// stage-coordinate bar: figure k of a bar standing at (gx, gz) fills a cx x cz footprint, then the next layer up
function bar(k: number, gx: number, gz: number, out: Float32Array, o: number, cx = 10, cz = 8) {
  const [x, y, z] = T(gx + ((k % cx) - (cx - 1) / 2) * SP, Math.floor(k / (cx * cz)) * LAYER, gz + ((Math.floor(k / cx) % cz) - (cz - 1) / 2) * SP);
  out[o] = x; out[o + 1] = y; out[o + 2] = z;
}
const barTop = (n: number, perLayer = 80) => Math.ceil(n / perLayer) * LAYER;
const IMD_GAP = 1.3;   // the IMD bars are thin (4 x 14 per layer) so their heights read as a chart
const TIER_GAP = 2.5;  // tier bars are 6 x 22 per layer

type Layout = {
  spot: { z: number; lag: number; bob: number }[];
  F: (Float32Array | null)[];          // fixed formation per chapter, null = on the road
  rank: Int32Array;                    // 0 = highest predicted risk
  tassel: number;                      // students (by rank) who form the tassel of the Gradly mark
  imd: { group: string; n: number; flagged: number }[];
};

function useLayout(students: Student[]): Layout {
  return useMemo(() => {
    const n = students.length;
    // On the road the crowd marches as one orderly block: fixed lanes across the road, one row behind the other.
    // Earliest starters fill the front rows; every student keeps their own cell, so nobody overlaps.
    const lanes = Math.floor((LANES * 2) / LANE_W) + 1;
    const queue = students.map((_, i) => i).sort((a, b) => students[a].first - students[b].first || rnd(a, 9) - rnd(b, 9));
    const spot: Layout['spot'] = new Array(n);
    queue.forEach((i, k) => {
      const lane = k % lanes, row = Math.floor(k / lanes);
      spot[i] = { z: (lane - (lanes - 1) / 2) * LANE_W, lag: row * ROW_D, bob: rnd(i, 7) * 6.28 };
    });
    const order = students.map((_, i) => i).sort((a, b) => students[b].p - students[a].p);
    const rank = new Int32Array(n);
    order.forEach((i, r) => { rank[i] = r; });
    const onRoad = (i: number, out: Float32Array) => {
      out[i * 3] = Math.min(28, students[i].last) * DAY - spot[i].lag;
      out[i * 3 + 1] = 0;
      out[i * 3 + 2] = spot[i].z;
    };
    const put = (out: Float32Array, i: number, p: [number, number, number]) => { out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2]; };
    const F: (Float32Array | null)[] = Array(PAGES).fill(null);

    // 4: twin accounts snap into one perfectly regular block on the road; the rest stay where they stopped (hidden)
    const f4 = new Float32Array(n * 3);
    let g = 0;
    students.forEach((s, i) => {
      if (!s.ghost) return onRoad(i, f4);
      const cols = 22;
      put(f4, i, T(PX + ((g % cols) - (cols - 1) / 2) * 0.24, 0, (Math.floor(g / cols) - 30) * 0.24));
      g++;
    });
    F[4] = f4;

    // 5: students repeating the module walk a loop (a spiral of rings) around the guide
    const f5 = new Float32Array(n * 3);
    const reps = students.filter((s) => s.att > 0).length;
    let q = 0;
    students.forEach((s, i) => {
      if (s.att === 0) return onRoad(i, f5);
      const ring = q % 6, a = (Math.floor(q / 6) / Math.ceil(reps / 6)) * Math.PI * 2, r = 1.2 + ring * 0.34;
      put(f5, i, T(PX + Math.cos(a) * r, 0, Math.sin(a) * r));
      q++;
    });
    F[5] = f5;

    // 6: four tier bars, highest risk first
    const f6 = new Float32Array(n * 3);
    const seen: Record<string, number> = {};
    order.forEach((i) => {
      const t = students[i].tier, k = (seen[t] = (seen[t] ?? -1) + 1);
      bar(k, PX + (TIERS.indexOf(t) - 1.5) * TIER_GAP, 0, f6, i * 3, 6, 22);
    });
    F[6] = f6;

    // 7: one queue ordered by predicted risk, the riskiest in the front row
    const f7 = new Float32Array(n * 3);
    const cols = 48;
    students.forEach((_, i) => {
      const r = rank[i];
      put(f7, i, T(PX + ((r % cols) - (cols - 1) / 2) * SP, 0, 4 - Math.floor(r / cols) * SP));
    });
    F[7] = f7;

    // 9: the crowd forms the Gradly mark (mortarboard + tassel), riskiest students in the tassel
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
    pts.sort((p, q2) => p[0] - q2[0] || p[2] - q2[2] || p[1] - q2[1]);
    const tassel = pts.slice(0, n).filter((p) => p[0] <= 1).length;
    // the mark is fitted to the road (half width MARK_HALF), so the tassel never runs into the trees and towers;
    // its figures are drawn smaller in that chapter so they still sit side by side
    const S = MARK_HALF / 15.5;
    const f9 = new Float32Array(n * 3);
    students.forEach((_, i) => {
      const [, x, y] = pts[rank[i]];
      put(f9, i, T(PX + (x - 24.5) * S, 0, (y - 25) * S * 1.5));   // stretched along depth so the low camera still reads it as the logo
    });
    F[9] = f9;

    // 8: one bar per deprivation decile (poorest left), flagged students at the bottom; unknown IMD waits far behind
    const f8 = new Float32Array(n * 3);
    const cnt: Record<string, number> = {};
    const flaggedFirst = students.map((_, i) => i).sort((a, b) => students[b].pred - students[a].pred);
    let u = 0;
    flaggedFirst.forEach((i) => {
      const gi = IMD.indexOf(students[i].imd);
      if (gi < 0) { put(f8, i, T(PX + ((u % 40) - 19.5) * SP, 0, -16 - Math.floor(u / 40) * SP)); u++; return; }
      const k = (cnt[students[i].imd] = (cnt[students[i].imd] ?? -1) + 1);
      bar(k, PX + (gi - 4) * IMD_GAP, 0, f8, i * 3, 4, 14);
    });
    F[8] = f8;
    const imd = IMD.map((group) => {
      const g2 = students.filter((s) => s.imd === group);
      return { group, n: g2.length, flagged: g2.filter((s) => s.pred === 1).length };
    });
    return { spot, F, rank, tassel, imd };
  }, [students]);
}

// One blocky student: legs, shirt, arms, head, hair. Shirt and arms take the per-student colour ("tint" = 1),
// everything else keeps its own vertex colour. Feet at y = 0, face towards +z.
function figureGeometry() {
  const parts: [number, number, number, number, number, number, string, number][] = [
    // w, h, d, x, y, z, colour, tint
    [0.042, 0.07, 0.05, -0.026, 0.035, 0, '#1E2655', 0],
    [0.042, 0.07, 0.05, 0.026, 0.035, 0, '#1E2655', 0],
    [0.104, 0.088, 0.062, 0, 0.114, 0, '#FFFFFF', 1],
    [0.026, 0.078, 0.04, -0.066, 0.112, 0, '#FFFFFF', 1],
    [0.026, 0.078, 0.04, 0.066, 0.112, 0, '#FFFFFF', 1],
    [0.1, 0.094, 0.09, 0, 0.205, 0, '#EDB98F', 0],
    [0.106, 0.032, 0.096, 0, 0.256, -0.002, '#5A3B2A', 2],
    [0.106, 0.06, 0.022, 0, 0.226, -0.04, '#5A3B2A', 2],
  ];
  const c = new THREE.Color();
  const geos = parts.map(([w, h, d, x, y, z, col, tint]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    c.set(col).convertSRGBToLinear();
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(new Array(n).fill(tint), 1));
    g.deleteAttribute('uv');
    g.scale(FIG, FIG, FIG);
    return g;
  });
  return mergeGeometries(geos)!;
}
// hair (tint 2) keeps its colour, except in the final chapter where the whole figure takes the student's colour,
// so the mortarboard reads as one shape from above
const hairMix = { value: 0 };
function figureMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.hairMix = hairMix;
    shader.vertexShader = 'attribute float tint;\nuniform float hairMix;\n' + shader.vertexShader.replace('#include <color_vertex>', `
      vColor = vec3(1.0);
      vColor *= color;
      #ifdef USE_INSTANCING_COLOR
        vColor = tint > 1.5 ? mix(vColor, instanceColor.xyz * 0.82, hairMix) : mix(vColor, vColor * instanceColor.xyz, tint);
      #endif
    `);
  };
  return m;
}

function Crowd({ students, layout }: { students: Student[]; layout: Layout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(figureGeometry, []);
  const mat = useMemo(figureMaterial, []);
  const C = useMemo(() => ({
    yellow: new THREE.Color(YELLOW), orange: new THREE.Color(ORANGE), blue: new THREE.Color(SKY_BLUE),
    fade: new THREE.Color(FADE), stone: new THREE.Color(STONE), imdSafe: new THREE.Color('#5B8DEF'),
    tier: Object.fromEntries(TIERS.map((t) => [t, new THREE.Color(TIER_HEX[t])])) as Record<Tier, THREE.Color>,
  }), []);
  const ca = useMemo(() => new THREE.Color(), []);
  const cb = useMemo(() => new THREE.Color(), []);
  const pa = useMemo(() => new Float32Array(3), []);
  const pb = useMemo(() => new Float32Array(3), []);
  const { spot, F, rank, tassel } = layout;

  // shirt colour of student i in chapter c (day only matters on the road):
  // on the road, yellow = predicted to fail, light blue = predicted to pass, orange = stopped being active
  const colour = (c: number, i: number, day: number, out: THREE.Color) => {
    const s = students[i];
    if (c < 3) {
      if (day > s.last) return out.copy(C.orange);
      const base = s.pred === 1 ? C.yellow : C.blue;
      return day >= s.first ? out.copy(base) : out.copy(base).lerp(C.fade, 0.3);
    }
    if (c === 3) return s.nosub ? out.copy(C.orange) : out.copy(s.pred === 1 ? C.yellow : C.blue).lerp(C.fade, day > s.last ? 0.6 : 0);
    if (c === 4) return out.copy(s.ghost ? C.orange : C.fade);
    if (c === 5) return out.copy(s.att > 0 ? C.yellow : C.fade);
    if (c === 6) return out.copy(C.tier[s.tier]);
    if (c === 7) return out.copy(rank[i] < story.capacity ? C.orange : C.fade);
    if (c === 8) return out.copy(s.pred === 1 ? C.yellow : C.imdSafe);
    return out.copy(rank[i] < tassel ? C.orange : C.stone);
  };
  // whether student i stands in chapter c's picture (the twin and repeater shots show only their group)
  // (the capacity shot shows the front of the risk queue only)
  const shown = (c: number, i: number) => (c === 4 ? +students[i].ghost : c === 5 ? +(students[i].att > 0) : c === 7 ? +(rank[i] < QUEUE_SHOWN) : 1);
  // position of student i in chapter c
  const place = (c: number, i: number, day: number, out: Float32Array) => {
    const f = F[c];
    if (f) { out[0] = f[i * 3]; out[1] = f[i * 3 + 1]; out[2] = f[i * 3 + 2]; return; }
    const s = students[i], { z, lag } = spot[i];
    // a student who has not started yet waits in their cell; once active they catch up over a day and a half
    const go = smooth(0, 1.5, day - s.first);
    out[0] = Math.min(day, s.last) * DAY * go - lag;
    out[1] = 0;
    out[2] = z;
  };

  useFrame(({ clock, camera }) => {
    const m = ref.current;
    if (!m) return;
    if (!m.instanceColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(students.length * 3), 3);
    const { i: c, w } = beat(story.offset);
    const day = dayAt(story.offset);
    const tt = clock.elapsedTime;
    hairMix.value = c === PAGES - 2 ? w : 0;
    const bothRoad = c + 1 < ROAD_CH;
    for (let i = 0; i < students.length; i++) {
      const s = students[i], { lag, bob } = spot[i];
      // figures leave one formation a little apart from each other, so the crowd flows instead of sliding as a block
      const wi = bothRoad ? w : smooth(0, 1, w * 1.6 - ((lag % 14) / 14) * 0.6);
      if (bothRoad) { place(c, i, day, pa); dummy.position.set(pa[0], pa[1], pa[2]); }
      else {
        place(c, i, DAYS[c], pa); place(c + 1, i, DAYS[c + 1], pb);
        const moved = Math.abs(pa[0] - pb[0]) + Math.abs(pa[2] - pb[2]) > 0.01;
        dummy.position.set(pa[0] + (pb[0] - pa[0]) * wi, pa[1] + (pb[1] - pa[1]) * wi + (moved ? Math.sin(Math.PI * wi) * 1.2 : 0), pa[2] + (pb[2] - pa[2]) * wi);
      }
      const walking = c < ROAD_CH - 1 && day >= s.first && day <= s.last && day > 0.05;
      if (walking) dummy.position.y += Math.abs(Math.sin(tt * 8 + bob)) * 0.03;
      // everyone turns to face the audience
      dummy.rotation.y = Math.atan2(camera.position.x - dummy.position.x, camera.position.z - dummy.position.z);
      const vis = shown(c, i) + (shown(c + 1, i) - shown(c, i)) * wi;
      // on the road the figures are drawn larger (close shots); in the formations they shrink to fit the charts
      const big = (1 + 0.4 * (c + 1 < ROAD_CH ? 1 : c < ROAD_CH ? 1 - wi : 0)) * (c === PAGES - 2 ? 1 - 0.5 * wi : 1);
      dummy.scale.setScalar((c < ROAD_CH && day > s.last && wi < 0.5 ? 0.85 : 1) * vis * big);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      colour(c, i, bothRoad ? day : DAYS[c], ca);
      colour(c + 1, i, bothRoad ? day : DAYS[c + 1], cb);
      m.setColorAt(i, ca.lerp(cb, bothRoad ? 0 : wi));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, students.length]} frustumCulled={false} />;
}

// The guide: one blocky student in a blue suit who walks the whole story and presents each chapter.
// Where he stands per chapter: x, z (world), scale (bigger in the wide formation shots) and gesture.
type Gesture = 'wave' | 'idle' | 'point';
const g4 = (sx: number, sz: number, s: number, ge: Gesture): [number, number, number, Gesture] => { const [x, , z] = T(sx, 0, sz); return [x, z, s, ge]; };
const GUIDE: [number, number, number, Gesture][] = [
  [0.2, 1.9, 1, 'wave'],
  [DAYS[1] * DAY + 1.2, 2, 1, 'idle'],
  [CLIFF * DAY + 2.5, 4.4, 1, 'wave'],
  [TASK * DAY + 4.5, 2.1, 1, 'point'],
  g4(PX - 4.6, 1.5, 1.3, 'point'),
  g4(PX, 0, 1.1, 'idle'),
  g4(PX - 7, 6.5, 2, 'point'),
  g4(PX + 2.2, 8.5, 1.7, 'wave'),
  g4(PX - 7.8, 8, 2, 'point'),
  g4(PX - 3.9, 2.8, 1.7, 'point'),
];
const SKIN = '#D9A47E', HAIR = '#5B3A26', SUIT = '#2F5BD3', PANTS = '#1B2456', FACE = '#1E2A38';
const ang = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));   // shortest turn a → b

function Guide() {
  const g = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const phase = useRef(0), clock = useRef(0), prev = useRef(new THREE.Vector3(GUIDE[0][0], 0, GUIDE[0][1]));
  useFrame(({ camera }, dt) => {
    if (!g.current) return;
    clock.current += dt;
    const t = clock.current;
    const { i, w } = beat(story.offset);
    const [ax, az, as, ag] = GUIDE[i], [bx, bz, bs, bg] = GUIDE[i + 1];
    const x = ax + (bx - ax) * w, z = az + (bz - az) * w, s = as + (bs - as) * w;
    const step = Math.hypot(x - prev.current.x, z - prev.current.z);
    const walking = step > 1e-3;
    phase.current += step * 3.2 / s;                       // stride follows distance, so fast travel = fast legs
    g.current.position.set(x, walking ? Math.abs(Math.sin(phase.current)) * 0.06 * s : 0, z);
    g.current.scale.setScalar(s);
    // face where he walks; once he stops, turn to the audience
    const face = walking ? Math.atan2(x - prev.current.x, z - prev.current.z) : Math.atan2(camera.position.x - x, camera.position.z - z);
    g.current.rotation.y += ang(g.current.rotation.y, face) * (1 - Math.exp(-dt * (walking ? 10 : 4)));
    prev.current.set(x, 0, z);

    const swing = walking ? Math.sin(phase.current) * 0.7 : 0;
    const gesture = w < 0.5 ? ag : bg;
    const still = 1 - smooth(0, 0.15, Math.min(w, 1 - w));     // 1 in a hold, 0 mid-travel
    legL.current!.rotation.x = swing; legR.current!.rotation.x = -swing;
    // arms: counter-swing while walking; in a hold the right arm waves or points, the left rests
    armL.current!.rotation.set(-swing * 0.8, 0, -0.08);
    const wave = gesture === 'wave' ? still : 0, point = gesture === 'point' ? still : 0;
    armR.current!.rotation.set(swing * 0.8 * (1 - still), 0,
      0.08 + wave * (2.7 + Math.sin(t * 7) * 0.35) + point * 1.45);
    body.current!.scale.y = 1 + Math.sin(t * 2.2) * 0.012;  // breathing
    head.current!.rotation.y = Math.sin(t * 0.9) * 0.12 * still + point * 0.35;   // glances toward what he points at
    head.current!.rotation.z = Math.sin(t * 1.3) * 0.04;
    // look up at the camera in the high shots (negative x tilts the face toward the sky)
    const lift = Math.atan2(camera.position.y - 1.4 * s, Math.hypot(camera.position.x - x, camera.position.z - z));
    head.current!.rotation.x = -Math.min(0.55, Math.max(0, lift - 0.15)) * still;
    eyes.current!.scale.y = t % 3.6 < 0.12 ? 0.15 : 1;    // blink
  });
  const box = (args: [number, number, number], color: string, pos: [number, number, number] = [0, 0, 0]) => (
    <mesh position={pos}><boxGeometry args={args} /><meshLambertMaterial color={color} /></mesh>
  );
  return (
    <group ref={g}>
      {/* legs pivot at the hip */}
      <group ref={legL} position={[0.11, 0.56, 0]}>{box([0.19, 0.52, 0.22], PANTS, [0, -0.26, 0])}{box([0.2, 0.08, 0.27], '#FFFFFF', [0, -0.5, 0.02])}</group>
      <group ref={legR} position={[-0.11, 0.56, 0]}>{box([0.19, 0.52, 0.22], PANTS, [0, -0.26, 0])}{box([0.2, 0.08, 0.27], '#FFFFFF', [0, -0.5, 0.02])}</group>
      <group ref={body} position={[0, 0.56, 0]}>
        {box([0.48, 0.56, 0.27], SUIT, [0, 0.28, 0])}
        {box([0.14, 0.3, 0.01], '#FFFFFF', [0, 0.41, 0.137])}   {/* shirt */}
        {box([0.05, 0.27, 0.012], YELLOW, [0, 0.38, 0.142])}    {/* tie */}
      </group>
      {/* arms pivot at the shoulder; +z rotation lifts the right arm out to the side */}
      <group ref={armL} position={[-0.32, 1.08, 0]}>{box([0.15, 0.5, 0.18], SUIT, [0, -0.22, 0])}{box([0.14, 0.1, 0.16], SKIN, [0, -0.5, 0])}</group>
      <group ref={armR} position={[0.32, 1.08, 0]}>{box([0.15, 0.5, 0.18], SUIT, [0, -0.22, 0])}{box([0.14, 0.1, 0.16], SKIN, [0, -0.5, 0])}</group>
      <group ref={head} position={[0, 1.13, 0]}>
        {box([0.44, 0.42, 0.42], SKIN, [0, 0.21, 0])}
        {box([0.46, 0.1, 0.44], HAIR, [0, 0.45, -0.01])}         {/* hair */}
        {box([0.46, 0.3, 0.08], HAIR, [0, 0.3, -0.2])}
        {/* face on the +z side */}
        <group ref={eyes} position={[0, 0.25, 0.212]}>
          {box([0.06, 0.09, 0.01], FACE, [-0.09, 0, 0])}
          {box([0.06, 0.09, 0.01], FACE, [0.09, 0, 0])}
          {box([0.02, 0.025, 0.012], '#FFFFFF', [-0.075, 0.025, 0.002])}
          {box([0.02, 0.025, 0.012], '#FFFFFF', [0.105, 0.025, 0.002])}
        </group>
        {box([0.09, 0.02, 0.01], HAIR, [-0.09, 0.34, 0.212])}     {/* brows */}
        {box([0.09, 0.02, 0.01], HAIR, [0.09, 0.34, 0.212])}
        <mesh position={[0, 0.13, 0.212]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.065, 0.014, 4, 10, Math.PI]} /><meshLambertMaterial color={FACE} /></mesh>
        {box([0.06, 0.035, 0.01], '#F3A08A', [-0.15, 0.15, 0.212])}  {/* cheeks */}
        {box([0.06, 0.035, 0.01], '#F3A08A', [0.15, 0.15, 0.212])}
      </group>
    </group>
  );
}

// A prop that stands only while one of its chapters is on screen (it appears and disappears mid-travel).
function InChapters({ ch, children }: { ch: number[]; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => { if (g.current) g.current.visible = ch.some((c) => Math.abs(story.offset * (PAGES - 1) - c) < 0.5); });
  return <group ref={g}>{children}</group>;
}

type Marks = React.RefObject<HTMLDivElement | null>;
// A label in the 3D scene that only shows while one of its chapters is on screen.
// Portalled outside the scroller: by default drei puts Html inside it, where off-screen labels stretch the scroll area.
function Label({ at, ch, layer, children, className = 'story-mark' }: { at: [number, number, number]; ch: number | number[]; layer: Marks; children: React.ReactNode; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chs = Array.isArray(ch) ? ch : [ch];
  useFrame(() => {
    if (!el.current) return;
    const o = Math.max(...chs.map(presence));
    el.current.style.opacity = String(o);
    el.current.style.visibility = o < 0.02 ? 'hidden' : 'visible';
  });
  return (
    <Html position={at} center zIndexRange={[1, 0]} portal={layer as React.RefObject<HTMLElement>}>
      <div ref={el} className={className}>{children}</div>
    </Html>
  );
}

// Facade texture: a grid of windows, some lit. `glow` = the emissive copy (only the lit windows).
function windowTextures() {
  const N = 8, px = 32;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N * px; return c; };
  const a = mk(), b = mk();
  const ca = a.getContext('2d')!, cb = b.getContext('2d')!;
  ca.fillStyle = '#3150B4'; ca.fillRect(0, 0, N * px, N * px);
  cb.fillStyle = '#000'; cb.fillRect(0, 0, N * px, N * px);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = rnd(x * 31 + y * 7, 3);
    const lit = r < 0.13 ? '#FFD45E' : r < 0.2 ? '#C9D6FF' : null;
    ca.fillStyle = lit ?? (r < 0.6 ? '#2A4699' : '#3A5AC0');
    ca.fillRect(x * px + 9, y * px + 7, 14, 17);
    if (lit) { cb.fillStyle = lit; cb.fillRect(x * px + 9, y * px + 7, 14, 17); }
  }
  return [a, b].map((c) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}
// a box whose UVs repeat the facade every TILE units, so windows keep their size on any building
const TILE = 6.4;
function buildingGeometry(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const su = f < 2 ? d / TILE : w / TILE, sv = h / TILE;
    for (let k = 0; k < 4; k++) {
      const j = f * 4 + k;
      if (f === 2 || f === 3) uv.setXY(j, 0.01, 0.01);          // roof and floor: plain facade colour
      else uv.setXY(j, uv.getX(j) * su, uv.getY(j) * sv);
    }
  }
  return g;
}

function City() {
  const [map, glow] = useMemo(windowTextures, []);
  const mats = useMemo<THREE.Material[]>(() => ['#FFFFFF', '#D3DCFF', '#AFC0F2'].map<THREE.Material>((tint) =>
    new THREE.MeshLambertMaterial({ map, color: tint, emissive: '#FFFFFF', emissiveMap: glow, emissiveIntensity: 0.75 }))
    .concat(new THREE.MeshBasicMaterial({ map, color: '#7F98E6', fog: false })), [map, glow]);
  const blocks = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; m: number }[] = [];
    // a street of towers on the far side of the road (screen-right in the road shots)
    let x = ROAD_FROM - 4, k = 0;
    while (x < ROAD_TO) {
      const w = 3 + rnd(k, 1) * 4, d = 3 + rnd(k, 2) * 4, h = 4 + rnd(k, 3) ** 1.4 * 18;
      out.push({ p: [x + w / 2, h / 2, -(ROAD_W / 2 + 3.2 + rnd(k, 4) * 2.5 + d / 2)], s: [w, h, d], m: k % 3 });
      // a second, taller row behind
      const h2 = 8 + rnd(k, 5) * 20;
      out.push({ p: [x + w / 2 + 1, h2 / 2, -(ROAD_W / 2 + 13 + rnd(k, 6) * 5)], s: [w + 1, h2, 5], m: (k + 1) % 3 });
      x += w + 0.6 + rnd(k, 7) * 1.5; k++;
    }
    // the skyline at the end of the road, seen behind every shot (hazy, drawn without fog)
    for (let j = 0; j < 40; j++) {
      const w = 7 + rnd(j, 8) * 9, h = 5 + rnd(j, 9) ** 1.5 * 15;
      out.push({ p: [ROAD_FROM - 120 - rnd(j, 10) * 20, h / 2, -150 + j * 8], s: [8, h, w], m: 3 });
    }
    return out.map((b) => ({ ...b, g: buildingGeometry(...b.s) }));
  }, []);
  return (
    <group>
      {blocks.map((b, i) => <mesh key={i} position={b.p} geometry={b.g} material={mats[b.m]} />)}
      {/* antennae with a little warning light on some roofs */}
      {blocks.filter((_, i) => i % 5 === 0).map((b, i) => (
        <group key={`a${i}`} position={[b.p[0], b.s[1], b.p[2]]}>
          <mesh position={[0, 1, 0]}><boxGeometry args={[0.06, 2, 0.06]} /><meshLambertMaterial color="#5B7BE0" /></mesh>
          <mesh position={[0, 2.05, 0]}><boxGeometry args={[0.18, 0.18, 0.18]} /><meshBasicMaterial color={YELLOW} /></mesh>
        </group>
      ))}
    </group>
  );
}

// Street lamps on the city side and low-poly trees on both sides.
function Street() {
  const lamps = useMemo(() => Array.from({ length: Math.floor((ROAD_TO - ROAD_FROM) / 5) }, (_, i) => ROAD_FROM + 2 + i * 5), []);
  const trees = useMemo(() => Array.from({ length: Math.floor((ROAD_TO - ROAD_FROM) / 4.5) * 2 }, (_, i) => ({
    x: ROAD_FROM + 1 + Math.floor(i / 2) * 4.5 + rnd(i, 1) * 1.5, z: -(ROAD_W / 2 + 1.9 + (i % 2) * 1.4 + rnd(i, 2) * 0.5), s: 0.7 + rnd(i, 3) * 0.4,
  })), []);
  const post = useRef<THREE.InstancedMesh>(null), arm = useRef<THREE.InstancedMesh>(null), bulb = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null), trunk = useRef<THREE.InstancedMesh>(null);
  const once = useRef(false);
  useFrame(() => {
    if (once.current || !post.current || !arm.current || !bulb.current || !crown.current || !trunk.current) return;
    once.current = true;
    const d = new THREE.Object3D();
    const z0 = -(ROAD_W / 2 + 0.7);
    lamps.forEach((x, i) => {
      d.position.set(x, 1.3, z0); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); d.updateMatrix(); post.current!.setMatrixAt(i, d.matrix);
      d.position.set(x, 2.6, z0 + 0.55); d.updateMatrix(); arm.current!.setMatrixAt(i, d.matrix);
      d.position.set(x, 2.52, z0 + 1.05); d.updateMatrix(); bulb.current!.setMatrixAt(i, d.matrix);
    });
    trees.forEach((t, i) => {
      d.position.set(t.x, 0.35 * t.s, t.z); d.scale.setScalar(t.s); d.rotation.set(0, rnd(i, 4) * 6, 0); d.updateMatrix(); trunk.current!.setMatrixAt(i, d.matrix);
      d.position.set(t.x, 0.95 * t.s, t.z); d.updateMatrix(); crown.current!.setMatrixAt(i, d.matrix);
    });
    for (const m of [post, arm, bulb, crown, trunk]) m.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={post} args={[undefined, undefined, lamps.length]}><boxGeometry args={[0.09, 2.6, 0.09]} /><meshLambertMaterial color="#6F8BE8" /></instancedMesh>
      <instancedMesh ref={arm} args={[undefined, undefined, lamps.length]}><boxGeometry args={[0.07, 0.07, 1.2]} /><meshLambertMaterial color="#6F8BE8" /></instancedMesh>
      <instancedMesh ref={bulb} args={[undefined, undefined, lamps.length]}><boxGeometry args={[0.32, 0.08, 0.2]} /><meshBasicMaterial color="#FFF1C2" /></instancedMesh>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]}><boxGeometry args={[0.1, 0.7, 0.1]} /><meshLambertMaterial color="#1A3A55" /></instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, trees.length]}><dodecahedronGeometry args={[0.5, 0]} /><meshLambertMaterial color="#215B6E" flatShading /></instancedMesh>
    </group>
  );
}

function Road() {
  const dash = useRef<THREE.InstancedMesh>(null);
  const n = Math.floor((ROAD_TO - ROAD_FROM) / 1.4);
  const once = useRef(false);
  useFrame(() => {
    if (once.current || !dash.current) return;
    once.current = true;
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) { d.position.set(ROAD_FROM + 0.5 + i * 1.4, 0.03, 0); d.updateMatrix(); dash.current.setMatrixAt(i, d.matrix); }
    dash.current.instanceMatrix.needsUpdate = true;
  });
  const len = ROAD_TO - ROAD_FROM, mid = (ROAD_TO + ROAD_FROM) / 2;
  return (
    <group>
      <mesh position={[mid, 0, 0]}><boxGeometry args={[len, 0.04, ROAD_W]} /><meshBasicMaterial color={ROAD} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[mid, 0.05, s * (ROAD_W / 2 + 0.6)]}><boxGeometry args={[len, 0.1, 1.2]} /><meshBasicMaterial color={WALK} /></mesh>
          <mesh position={[mid, 0.03, s * (ROAD_W / 2 - 0.35)]}><boxGeometry args={[len, 0.02, 0.09]} /><meshBasicMaterial color="#F4F6FF" /></mesh>
        </group>
      ))}
      <instancedMesh ref={dash} args={[undefined, undefined, n]}><boxGeometry args={[0.65, 0.02, 0.1]} /><meshBasicMaterial color={YELLOW} /></instancedMesh>
    </group>
  );
}

function Gate({ x, color, h = 3.6, t = 0.34 }: { x: number; color: string; h?: number; t?: number }) {
  const zw = ROAD_W / 2 - 0.1;
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, h / 2, -zw]}><boxGeometry args={[t, h, t]} /><meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.35} /></mesh>
      <mesh position={[0, h / 2, zw]}><boxGeometry args={[t, h, t]} /><meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.35} /></mesh>
      <mesh position={[0, h - t / 2, 0]}><boxGeometry args={[t, t, zw * 2 + t]} /><meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.35} /></mesh>
    </group>
  );
}

// Night sky: a gradient dome (light at the horizon, deep navy overhead), stars and a moon.
function Sky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color('#3858BE') }, mid: { value: new THREE.Color('#1C2C72') }, top: { value: new THREE.Color('#0B1440') } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 horizon; uniform vec3 mid; uniform vec3 top; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.65, h));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  }), []);
  const stars = useMemo(() => {
    const p: number[] = [];
    for (let i = 0; i < 420; i++) {
      const a = rnd(i, 1) * Math.PI * 2, e = 0.12 + rnd(i, 2) * 1.2;
      p.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, []);
  const sky = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { sky.current?.position.copy(camera.position); });   // the dome travels with the camera
  return (
    <>
      <group ref={sky}>
        <mesh material={mat} renderOrder={-1}><sphereGeometry args={[400, 32, 16]} /></mesh>
        <points geometry={stars}><pointsMaterial color="#FFFFFF" size={1.6} sizeAttenuation={false} transparent opacity={0.75} fog={false} depthWrite={false} /></points>
      </group>
      <Billboard position={[ROAD_FROM - 150, 42, 22]}>
        <mesh><circleGeometry args={[10, 48]} /><meshBasicMaterial color="#9FB6FF" transparent opacity={0.18} fog={false} /></mesh>
        <mesh position={[0, 0, 0.1]}><circleGeometry args={[6.2, 48]} /><meshBasicMaterial color="#F4F6FF" fog={false} /></mesh>
        <mesh position={[-1.6, 1.4, 0.2]}><circleGeometry args={[1.1, 24]} /><meshBasicMaterial color="#D6DCEE" fog={false} /></mesh>
        <mesh position={[1.9, -0.6, 0.2]}><circleGeometry args={[0.8, 24]} /><meshBasicMaterial color="#D6DCEE" fog={false} /></mesh>
        <mesh position={[0.1, -2.4, 0.2]}><circleGeometry args={[0.55, 24]} /><meshBasicMaterial color="#D6DCEE" fog={false} /></mesh>
      </Billboard>
    </>
  );
}

function World({ marks, layout, tiers }: { marks: Marks; layout: Layout; tiers: Record<Tier, number> }) {
  return (
    <group>
      <Sky />
      <mesh rotation-x={-Math.PI / 2} position={[40, -0.03, 0]}>
        <planeGeometry args={[400, 300]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      <Road />
      <Street />
      <City />
      <InChapters ch={[0, 1, 2]}><Gate x={START} color="#5B8DEF" /></InChapters>
      <InChapters ch={[2]}><Gate x={CLIFF * DAY} color={ORANGE} h={4} t={0.42} /></InChapters>
      <InChapters ch={[3]}><Gate x={TASK * DAY} color={ORANGE} h={4} t={0.42} /></InChapters>
      <Label at={[START, 4.3, 0]} ch={[0, 1, 2]} layer={marks} className="story-gate">Hari 1</Label>
      <Label at={[CLIFF * DAY, 4.8, 0]} ch={2} layer={marks} className="story-gate">Hari 14</Label>
      <Label at={[TASK * DAY, 4.8, 0]} ch={3} layer={marks} className="story-gate">Tenggat tugas 1</Label>
      {TIERS.map((t, k) => (
        <Label key={t} at={T(PX + (k - 1.5) * TIER_GAP, barTop(tiers[t], 132) + 0.9, 0)} ch={6} layer={marks} className="story-tier">
          {TIER_NAME[t]}<b style={{ color: TIER_HEX[t] }}>{tiers[t].toLocaleString('id-ID')}</b>
        </Label>
      ))}
      {layout.imd.map((g, k) => (
        <group key={g.group}>
          <Label at={T(PX + (k - 4) * IMD_GAP, barTop(g.n, 56) + 0.5, 0)} ch={8} layer={marks} className="story-chip">{Math.round((g.flagged / g.n) * 100)}%</Label>
          <Label at={T(PX + (k - 4) * IMD_GAP, -0.3, 1)} ch={8} layer={marks}>{k === 0 ? 'Termiskin' : k === IMD.length - 1 ? 'Terkaya' : ''}</Label>
        </group>
      ))}
    </group>
  );
}

// Camera: each chapter has one framed shot; between chapters it blends from one to the next.
// The picture is always pushed to the right half, opposite the chapter text.
// share of the screen width the picture is pushed right, away from the chapter text
const PUSH = 0.157;
function Rig() {
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const la = useMemo(() => new THREE.Vector3(), []);
  const lb = useMemo(() => new THREE.Vector3(), []);
  const za = useMemo(() => ({ zoom: 1, pan: 1 }), []);
  const zb = useMemo(() => ({ zoom: 1, pan: 1 }), []);
  // the framed shot of chapter c. zoom > 1 = long lens from far away, so the bar charts are seen straight from the
  // front (no slanted sides); pan = how far the picture is pushed right, away from the text (1 = default)
  const shot = (c: number, p: THREE.Vector3, l: THREE.Vector3, z: { zoom: number; pan: number }) => {
    const x = DAYS[c] * DAY;
    z.zoom = 1; z.pan = 1;
    switch (c) {
      case 0: p.set(5, 1.7, 5.4); l.set(-8, 0.9, -1.4); break;                    // looking back at the start gate
      case 1: p.set(x + 6, 1.9, 5.4); l.set(x - 7, 0.9, -1.4); break;
      case 2: p.set(CLIFF * DAY + 12, 4.2, 12); l.set(CLIFF * DAY - 10, 1.2, -1.5); break;  // across the road: both gates in view
      case 3: p.set(x + 10.5, 2.3, 5.6); l.set(x - 4, 1.9, -1.4); break;
      case 4: setT(p, PX - 0.5, 13, 9); setT(l, PX - 0.5, 0, -3.2); break;
      case 5: setT(p, PX - 1, 7.5, 9); setT(l, PX - 0.6, 0.2, 0); break;
      case 6: setT(p, PX, 9, 38); setT(l, PX, 5.2, 0); z.zoom = 1.9; z.pan = 1.2; break;
      case 7: setT(p, PX, 4.6, 19); setT(l, PX, 0.2, 4); break;
      case 8: setT(p, PX, 9.5, 42); setT(l, PX, 5.4, 0); z.zoom = 2; z.pan = 1.2; break;
      default: setT(p, PX, 17, 30); setT(l, PX, 2.4, 0); z.zoom = 1.85; z.pan = 0.85;
    }
  };
  useFrame(({ camera, size, scene }) => {
    const cam = camera as THREE.PerspectiveCamera, cam0 = cam;
    const { i, w } = beat(story.offset);
    shot(i, a, la, za); shot(i + 1, b, lb, zb);
    const zoom = za.zoom + (zb.zoom - za.zoom) * w, pan = za.pan + (zb.pan - za.pan) * w;
    // on narrow screens the text sits on top, so the picture stays centred
    const aspect = size.width / size.height;
    // below 16:9, widen the vertical field of view so the horizontal framing (made for 16:9, like the deck) is kept
    const tanHalf = (Math.tan((21 * Math.PI) / 180) * Math.max(1, (16 / 9) / Math.max(aspect, 1.2))) / zoom;
    const fov = (2 * Math.atan(tanHalf) * 180) / Math.PI;
    // film offset is measured on the near plane, so scale it with the lens to push the picture by a fixed share of the width
    const shift = aspect > 1.2 ? -PUSH * pan * cam0.filmGauge * 2 * tanHalf * aspect : 0;
    // fog follows the lens, so a far-away long-lens shot is not washed out
    if (scene.fog instanceof THREE.Fog) { scene.fog.near = 24 * zoom; scene.fog.far = 95 * zoom; }
    // no extra smoothing here: story.offset is already eased, and a second lag would let text and camera drift apart
    camera.position.copy(a).lerp(b, w);
    camera.lookAt(la.lerp(lb, w));
    if (cam.filmOffset !== shift || Math.abs(cam.fov - fov) > 0.01) { cam.filmOffset = shift; cam.fov = fov; cam.updateProjectionMatrix(); }
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
    if (hud) hud.textContent = p < ROAD_CH - 0.5 ? `Hari ${Math.max(1, Math.round(dayAt(story.offset)))} / 28` : '';
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
          style={{ '--fill': `${((k - 1) / 59) * 100}%` } as React.CSSProperties}
          onChange={(e) => { const v = +e.target.value; setK(v); story.capacity = Math.min(n, v * PER_COUNSELOR); }} />
      </label>
      <p className="reach"><b>{Math.round(pt.precision * 100)}%</b> tepat sasaran, menjangkau <b>{helped.toLocaleString('id-ID')}</b> dari sekitar <b>{atRisk.toLocaleString('id-ID')}</b> yang berisiko.</p>
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
  const marks = useRef<HTMLDivElement>(null);
  const layout = useLayout(students);
  const poor = layout.imd[0], rich = layout.imd[layout.imd.length - 1];
  return (
    <>
    <div ref={marks} className="story-marks" />
    <Canvas flat camera={{ position: [7.5, 2.3, 2.6], fov: 42, far: 1000 }} dpr={[1, 2]} style={{ position: 'fixed', inset: 0, background: '#16225A' }}
      // dev only: lets the layout of each shot be measured from the browser console
      onCreated={(st) => { if (process.env.NODE_ENV !== 'production') (window as unknown as { __story3d?: unknown }).__story3d = st; }}>
      <fog attach="fog" args={[FOG, 24, 95]} />
      <hemisphereLight args={['#C9D5FF', '#3A4590', 1.9]} />
      <directionalLight position={[12, 14, 8]} intensity={1.6} />
      <ScrollControls pages={PAGES} damping={0.25}>
        <World marks={marks} layout={layout} tiers={stats.tiers} />
        <Crowd students={students} layout={layout} />
        <Guide />
        <Rig />
        <Driver />
      </ScrollControls>
    </Canvas>
    <div className="chapters">
        <section className="chapter">
          <h1><em>{num(stats.n)}</em> mahasiswa. <em>28 hari.</em></h1>
          <p>Dari aktivitas 28 hari pertama di LMS, <b>{num(stats.flagged)}</b> diperkirakan gagal atau mundur.</p>
        </section>
        <section className="chapter">
          <h2>Hari <em>pertama</em></h2>
          <p className="big">Aktif sejak hari pertama: <b>{pct(stats.dayZero)}</b> gagal. Baru muncul setelah hari ke-14: <b>{pct(stats.late14)}</b>.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Sapa yang belum aktif di minggu pertama.</p>
        </section>
        <section className="chapter">
          <h2>Hari <em>ke-14</em></h2>
          <p className="big"><b>{num(stats.vanished14N)}</b> mahasiswa berhenti aktif sebelum hari ke-14. <b>{pct(stats.vanished14)}</b> gagal.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Hubungi mereka sebelum hari ke-14.</p>
        </section>
        <section className="chapter">
          <h2>Tugas <em>pertama</em></h2>
          <p className="big"><b>{num(stats.nosub)}</b> mahasiswa tidak mengumpulkan tugas pertama. <b>{pct(stats.nosubRate)}</b> gagal.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Dosen pembimbing langsung dikabari saat tenggat lewat.</p>
        </section>
        <section className="chapter">
          <h2>Akun <em>kembar</em></h2>
          <p className="big"><b>{num(stats.ghost)}</b> akun punya aktivitas yang sama persis. <b>{pct(stats.ghostRate)}</b> gagal.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Pastikan akunnya benar dipakai.</p>
        </section>
        <section className="chapter">
          <h2><em className="solo">Mengulang</em></h2>
          <p className="big"><b>{num(stats.repeaters)}</b> mahasiswa sedang mengulang. Tanpa nilai di percobaan sebelumnya: <b>{pct(stats.prevNoScore)}</b> gagal lagi.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Dampingi sejak minggu pertama.</p>
        </section>
        <section className="chapter">
          <h2>Empat <em>tingkat</em></h2>
          <p className="big">Semua tanda digabung jadi satu skor. <b>{num(stats.tiers.merah)}</b> mahasiswa kritis.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Kritis dihubungi dalam 48 jam.</p>
        </section>
        <section className="chapter">
          <h2><em className="solo">Kapasitas</em></h2>
          <Capacity n={stats.n} capacity={capacity} atRisk={Math.round(stats.n * stats.baseRate)} />
        </section>
        <section className="chapter">
          <h2><em className="solo">Kesenjangan</em></h2>
          <p className="big">Wilayah termiskin: <b>{pct(poor.flagged / poor.n)}</b> berisiko. Wilayah terkaya: <b>{pct(rich.flagged / rich.n)}</b>.</p>
          <p className="act"><span>Yang dilakukan kampus</span>Bagi bantuan menurut risiko, bukan rata.</p>
        </section>
        <section className="chapter end">
          <h2>Mulai <em>sekarang</em></h2>
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
