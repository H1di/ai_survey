// Pure growth simulation for the Invector branch. No canvas and no DOM: a
// tick returns the segments to draw, so the growth rules stay testable and
// the component below stays a renderer.
//
// Parameters are transcribed from the design artifact.

export const BRANCH_PRESETS = {
  hero: {
    bg: "#000000",
    origins: [0.72],
    mainHue: [255, 225, 170],
    branchHue: [200, 165, 255],
    dropHue: [255, 235, 190],
    trunkWidth: 5.5,
    trunkLife: 280,
    trunkSpeed: 4.6,
    branchSpeed: 2.8,
    wander: 0.32,
    maxDepth: 4,
    branchRate: 0.018,
    splitAngle: 0.45,
    childWidthMul: 0.66,
    childLifeMul: 0.7,
    taper: 0.997,
    dropRate: 0.03,
    dropSpeed: 0.7,
    dropLife: 90,
    pause: 270,
  },
  graph: {
    bg: "transparent",
    origins: [0.5],
    mainHue: [255, 225, 170],
    branchHue: [163, 120, 255],
    dropHue: [255, 235, 190],
    trunkWidth: 3.5,
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
    dropRate: 0.03,
    dropSpeed: 0.6,
    dropLife: 90,
    pause: 100,
  },
};

// Ceiling on live tips: the branch rate compounds, and an uncapped run melts
// a laptop fan within a minute.
export const MAX_TIPS = 260;

export function seedTips(opt, W, H, rng = Math.random) {
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

    if (t.life > 0 && t.y > -20 && t.x > -20 && t.x < W + 20 && t.w > 0.4) {
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
