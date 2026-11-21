// Browser evaluator for the light CatBoost model (oblivious trees). Verified against CatBoost's own
// predictions with the probe rows in live_meta.json (checkProbe).
import { load } from './data';

type Trees = { bias: number; scale: number; trees: { s: [number, number][]; v: number[] }[] };
export type LiveMeta = {
  features: string[]; num: string[]; cat: string[]; levels: Record<string, string[]>;
  cv: { auc: number; f1: number }; reference: Record<string, number>;
  probe: { x: number[][]; p: number[] }; ranges: Record<string, [number, number]>;
};
export type LiveInput = Record<string, number | string>;

export async function loadLive() {
  const [trees, meta] = await Promise.all([load<Trees>('live_trees'), load<LiveMeta>('live_meta')]);
  const predictVec = (x: number[]) => {
    let s = trees.bias;
    for (const t of trees.trees) {
      let i = 0;
      for (let d = 0; d < t.s.length; d++) if (x[t.s[d][0]] > t.s[d][1]) i |= 1 << d;
      s += t.v[i];
    }
    return 1 / (1 + Math.exp(-trees.scale * s));
  };
  const encode = (inp: LiveInput) => meta.features.map((f) => {
    const eq = f.indexOf('=');
    if (eq > 0) return inp[f.slice(0, eq)] === f.slice(eq + 1) ? 1 : 0;
    if (f === 'avg_score' && Number(inp.has_score) === 0) return -1;
    return Number(inp[f]);
  });
  const predict = (inp: LiveInput) => predictVec(encode(inp));
  const probeOk = meta.probe.x.every((x, i) => Math.abs(predictVec(x) - meta.probe.p[i]) < 1e-4);
  console.assert(probeOk, 'live model evaluator does not reproduce CatBoost');
  return { predict, meta, probeOk };
}
