// Pure growth simulation for the Invector branch. No canvas and no DOM: a
// tick returns the segments to draw, so the growth rules stay testable and
// the component below stays a renderer.
//
// Colours are not written here: `mainHue` / `branchHue` / `dropHue` name the
// token (theme/tokens.css) the renderer paints that role with, and
// `alphaScale` sets how pale the whole field reads on the white page.

export const BRANCH_PRESETS = {
  // The entry and sign-in field: fine ink fibres radiating from one point
  // right of centre, grown once and left standing (no loop).
  hero: {
    bg: "transparent",
    radial: { x: 0.64, y: 0.5, count: 16 },
    origins: [],
    mainHue: "--line",
    branchHue: "--line",
    dropHue: "--line",
    alphaScale: 0.26,
    loop: false,
    trunkWidth: 1.3,
    trunkLife: 300,
    trunkSpeed: 2.3,
    branchSpeed: 1.8,
    wander: 0.36,
    maxDepth: 5,
    branchRate: 0.034,
    splitAngle: 0.5,
    childWidthMul: 0.74,
    childLifeMul: 0.72,
    taper: 0.997,
    dropRate: 0.004,
    dropSpeed: 0.25,
    dropLife: 160,
    pause: 0,
    // The one path through the field: a smooth ink line from the lower left
    // to the bird at the upper right, its last stretch in the accent. Points
    // are fractions of the canvas: a start, then [c1, c2, end] cubic triples.
    path: {
      start: [0, 0.975],
      curves: [
        [[0.09, 0.93], [0.17, 0.862], [0.25, 0.858]],
        [[0.33, 0.855], [0.36, 0.84], [0.395, 0.79]],
        [[0.43, 0.74], [0.47, 0.72], [0.52, 0.7]],
        [[0.58, 0.676], [0.6, 0.64], [0.605, 0.6]],
        [[0.61, 0.56], [0.64, 0.545], [0.68, 0.515]],
        [[0.72, 0.485], [0.76, 0.47], [0.78, 0.42]],
        [[0.8, 0.37], [0.815, 0.33], [0.84, 0.3]],
        [[0.86, 0.28], [0.875, 0.265], [0.89, 0.245]],
      ],
      accentFrom: 0.93,
      color: "--line",
      accent: "--accent",
      width: 1.4,
      delay: 40,
      duration: 170,
      // Below this width the column of copy covers the field; the path and
      // the bird would run through the text, so the field stands alone.
      minWidth: 760,
    },
  },
  graph: {
    bg: "transparent",
    origins: [0.5],
    mainHue: "--line",
    branchHue: "--line",
    dropHue: "--line",
    alphaScale: 0.22,
    loop: true,
    trunkWidth: 2.2,
    trunkLife: 260,
    trunkSpeed: 3.6,
    branchSpeed: 2.4,
    wander: 0.4,
    maxDepth: 6,
    branchRate: 0.03,
    splitAngle: 0.55,
    childWidthMul: 0.68,
    childLifeMul: 0.74,
    taper: 0.997,
    dropRate: 0.01,
    dropSpeed: 0.6,
    dropLife: 90,
    pause: 100,
  },
};

// Ceiling on live tips: the branch rate compounds, and an uncapped run melts
// a laptop fan within a minute.
export const MAX_TIPS = 260;

export function seedTips(opt, W, H, rng = Math.random) {
  if (opt.radial) {
    const { x, y, count } = opt.radial;
    return Array.from({ length: count }, (_, i) => ({
      x: W * x,
      y: H * y,
      a: (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.3,
      w: opt.trunkWidth,
      life: opt.trunkLife * (0.75 + rng() * 0.5),
      depth: 0,
      main: true,
      hue: opt.mainHue,
    }));
  }
  return opt.origins.map((fx) => ({
    x: W * fx,
    y: H + 4,
    a: -Math.PI / 2 + (rng() - 0.5) * 0.25,
    w: opt.trunkWidth,
    life: opt.trunkLife,
    depth: 0,
    main: true,
    hue: opt.mainHue,
  }));
}

// One frame of growth. Returns the surviving tips, the segments drawn this
// frame, and any drops thrown off. The input array is never mutated.
export function tickTips(tips, opt, W, H, rng = Math.random) {
  const next = [];
  const segments = [];
  const drops = [];

  for (const source of tips) {
    const t = { ...source };
    const speed = t.main ? opt.trunkSpeed : opt.branchSpeed;
    const nx = t.x + Math.cos(t.a) * speed;
    const ny = t.y + Math.sin(t.a) * speed;

    segments.push({
      x1: t.x,
      y1: t.y,
      x2: nx,
      y2: ny,
      hue: t.hue,
      main: t.main,
      width: Math.max(0.6, t.w),
      alpha: t.main ? 0.9 : Math.max(0.25, 0.75 - t.depth * 0.12),
    });

    t.x = nx;
    t.y = ny;
    t.a += (rng() - 0.5) * opt.wander - 0.002;
    t.w *= opt.taper;
    t.life -= 1;

    if (rng() < opt.dropRate * (t.main ? 2.2 : 1)) {
      drops.push({
        x: t.x,
        y: t.y,
        vy: -(opt.dropSpeed * (0.7 + rng() * 0.6)),
        vx: (rng() - 0.5) * 0.3,
        life: opt.dropLife,
        r: t.main ? 2.2 : 1.3,
        hue: opt.dropHue,
      });
    }

    if (t.life > 0 && t.y > -20 && t.y < H + 20 && t.x > -20 && t.x < W + 20 && t.w > 0.4) {
      next.push(t);
      if (t.depth < opt.maxDepth && tips.length < MAX_TIPS && rng() < opt.branchRate) {
        const dir = rng() < 0.5 ? 1 : -1;
        next.push({
          x: t.x,
          y: t.y,
          a: t.a + dir * (opt.splitAngle * (0.7 + rng() * 0.6)),
          w: t.w * opt.childWidthMul,
          life: t.life * opt.childLifeMul,
          depth: t.depth + 1,
          main: false,
          hue: opt.branchHue,
        });
      }
    }
  }

  return { tips: next, segments, drops };
}

export function tickDrops(drops) {
  const next = [];
  for (const source of drops) {
    const d = { ...source, x: source.x + source.vx, y: source.y + source.vy, life: source.life - 1 };
    if (d.life > 0) next.push(d);
  }
  return next;
}

// Samples a preset's path (fractions of W × H) into a pixel polyline with
// cumulative lengths, so a renderer can stroke any leading fraction of it.
export function samplePath(path, W, H, perCurve = 32) {
  const px = ([fx, fy]) => ({ x: fx * W, y: fy * H });
  const pts = [px(path.start)];
  for (const [c1, c2, end] of path.curves) {
    const p0 = pts[pts.length - 1];
    const a = px(c1);
    const b = px(c2);
    const c = px(end);
    for (let i = 1; i <= perCurve; i += 1) {
      const s = i / perCurve;
      const u = 1 - s;
      pts.push({
        x: u * u * u * p0.x + 3 * u * u * s * a.x + 3 * u * s * s * b.x + s * s * s * c.x,
        y: u * u * u * p0.y + 3 * u * u * s * a.y + 3 * u * s * s * b.y + s * s * s * c.y,
      });
    }
  }
  const lens = [0];
  for (let i = 1; i < pts.length; i += 1) {
    lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, lens, total: lens[lens.length - 1] };
}

// The part of a sampled path between length fractions `from` and `to`, with
// interpolated end points.
export function pathSlice(sampled, from, to) {
  const { pts, lens, total } = sampled;
  const a = Math.max(0, Math.min(1, from)) * total;
  const b = Math.max(0, Math.min(1, to)) * total;
  if (b <= a) return [];
  const at = (len) => {
    let i = 1;
    while (i < lens.length - 1 && lens[i] < len) i += 1;
    const span = lens[i] - lens[i - 1] || 1;
    const k = (len - lens[i - 1]) / span;
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
  };
  const out = [at(a)];
  for (let i = 0; i < pts.length; i += 1) if (lens[i] > a && lens[i] < b) out.push(pts[i]);
  out.push(at(b));
  return out;
}
