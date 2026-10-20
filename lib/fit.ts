// Nelson-Siegel fit of yield against maturity, used to flag gilts trading cheap or rich
// to the curve. For each candidate decay τ the betas are an ordinary least-squares
// problem; we keep the τ with the smallest squared error.

export interface NelsonSiegel {
  b0: number;
  b1: number;
  b2: number;
  tau: number;
  rmse: number;
}

function loadings(t: number, tau: number): [number, number, number] {
  const x = t / tau;
  const f = x < 1e-8 ? 1 : (1 - Math.exp(-x)) / x;
  return [1, f, f - Math.exp(-x)];
}

export function nsValue(p: NelsonSiegel, t: number): number {
  const [a, b, c] = loadings(t, p.tau);
  return p.b0 * a + p.b1 * b + p.b2 * c;
}

function solve3(A: number[][], b: number[]): number[] | null {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      for (let j = col; j < 4; j++) m[r][j] -= k * m[col][j];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

export function fitNelsonSiegel(points: { t: number; y: number }[]): NelsonSiegel | null {
  if (points.length < 4) return null;
  let best: NelsonSiegel | null = null;
  for (let tau = 0.25; tau <= 20; tau *= 1.05) {
    const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const Aty = [0, 0, 0];
    for (const p of points) {
      const l = loadings(p.t, tau);
      for (let i = 0; i < 3; i++) {
        Aty[i] += l[i] * p.y;
        for (let j = 0; j < 3; j++) AtA[i][j] += l[i] * l[j];
      }
    }
    const beta = solve3(AtA, Aty);
    if (!beta) continue;
    const cand = { b0: beta[0], b1: beta[1], b2: beta[2], tau, rmse: 0 };
    const sse = points.reduce((s, p) => s + (nsValue(cand, p.t) - p.y) ** 2, 0);
    cand.rmse = Math.sqrt(sse / points.length);
    if (!best || cand.rmse < best.rmse) best = cand;
  }
  return best;
}
