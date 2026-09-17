// Every rating on this chain, one dot each, coloured by where the money behind it came from.
//
// A table cannot carry this argument. The claim is a ratio of 16 to 9,188, and two numbers in a
// row read as "some are good, some are bad" no matter how they are phrased. Drawn at one dot per
// rating, the ratio is the image: a wall of manufactured opinion with a handful of live pixels
// in it, and the handful is hard to find on purpose, because it is hard to find in the registry.
//
// Dots are grouped by agent and agents are ordered by size, so the largest block on screen is
// agent #182 and its 7,665 ratings. That block is not a design choice; it is 83% of everything
// this registry has ever recorded.
import { useEffect, useMemo, useRef, useState } from "react";

type Agent = {
  id: number; owner: string | null; total: number; counts: number[];
  verdict: string | null; first: string | null; last: string | null;
};
type Farm = {
  generatedAt: string; indexedAt: string;
  buckets: { key: string; label: string }[];
  totals: number[]; ratings: number; registrations: number; ratedAgents: number;
  independentWallets: number;
  loop: { agentId: number; wallets: number; monOut: number; monBack: number; monMedian: number;
          secondsToRating: number; secondsToReturn: number } | null;
  agents: Agent[];
};

// Order matches farm-map.mjs. Independent is the only colour that carries light, because it is
// the only category that represents somebody's own opinion.
const COLOUR = ["#f0798f", "#f0c274", "#5ad1a5", "#39425e", "#232a3d"];
const PITCH = 5;      // one dot every 5 device-independent pixels
const DOT = 3.4;

export function FarmMap() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; agent: Agent; bucket: number } | null>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    fetch("farm.json").then((r) => r.json()).then(setFarm).catch(() => {});
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [farm]);

  // One entry per rating, in the order they are drawn: which agent produced it and which bucket
  // it fell in. Built once, then reused for both painting and hit-testing, so the tooltip can
  // never disagree with the picture.
  const cells = useMemo(() => {
    if (!farm) return [];
    const out: { agent: Agent; bucket: number }[] = [];
    for (const a of farm.agents) {
      a.counts.forEach((n, b) => { for (let i = 0; i < n; i++) out.push({ agent: a, bucket: b }); });
    }
    return out;
  }, [farm]);

  const cols = Math.max(20, Math.floor(width / PITCH));
  const rows = Math.ceil(cells.length / cols);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cells.length) return;
    const dpr = window.devicePixelRatio || 1;
    const h = rows * PITCH;
    cv.width = width * dpr; cv.height = h * dpr;
    cv.style.width = `${width}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    cells.forEach((c, i) => {
      const x = (i % cols) * PITCH, y = Math.floor(i / cols) * PITCH;
      ctx.fillStyle = COLOUR[c.bucket];
      if (c.bucket === 2) {
        // The sixteen. Drawn larger and haloed so they can be found at all, which is the point:
        // at true scale they are 0.17% of the field and would otherwise be invisible.
        ctx.beginPath();
        ctx.arc(x + PITCH / 2, y + PITCH / 2, DOT, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(90, 209, 165, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + PITCH / 2, y + PITCH / 2, DOT + 2.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillRect(x, y, DOT, DOT);
      }
    });
  }, [cells, cols, rows, width]);

  if (!farm) return null;
  const pct = (n: number) => `${((n / farm.ratings) * 100).toFixed(2)}%`;

  return (
    <section className="farm">
      <h2>Every rating this registry has, one dot each</h2>
      <p className="farm-lead">
        {farm.ratings.toLocaleString()} ratings across {farm.ratedAgents} agents. The green ones,
        all {farm.totals[2]} of them, are the ratings left after asking whether the rater paid the
        agent before rating it and whether the agent's owner had funded that rater first. They come
        from {farm.independentWallets} wallets.
      </p>

      <div className="farm-box" ref={boxRef} onMouseLeave={() => setHover(null)}>
        <canvas
          ref={ref}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const col = Math.floor((e.clientX - r.left) / PITCH);
            const row = Math.floor((e.clientY - r.top) / PITCH);
            // Past the last column the index would wrap onto the next row and name the wrong
            // agent. A tooltip on a picture about misattributed evidence must not misattribute.
            if (col < 0 || col >= cols || row < 0) return setHover(null);
            const c = cells[row * cols + col];
            setHover(c ? { x: e.clientX - r.left, y: e.clientY - r.top, agent: c.agent, bucket: c.bucket } : null);
          }}
        />
        {hover && (
          <div className="farm-tip" style={{ left: Math.min(hover.x + 12, width - 240), top: hover.y + 14 }}>
            <b>agent #{hover.agent.id}</b>
            {hover.agent.verdict && <span className="farm-tip-v">{hover.agent.verdict}</span>}
            <div>{farm.buckets[hover.bucket].label}</div>
            <div className="farm-tip-m">
              {hover.agent.total.toLocaleString()} ratings
              {hover.agent.first ? `, ${hover.agent.first} to ${hover.agent.last}` : ""}
            </div>
          </div>
        )}
      </div>

      <ul className="farm-key">
        {farm.buckets.map((b, i) => (
          <li key={b.key}>
            <i style={{ background: COLOUR[i] }} />
            <b>{farm.totals[i].toLocaleString()}</b>
            <span className="farm-key-pct">{pct(farm.totals[i])}</span>
            {b.label}
          </li>
        ))}
      </ul>

      {farm.loop && (
        <div className="farm-loop">
          <h3>What one of those dots cost the owner to produce</h3>
          <div className="farm-loop-row">
            <span className="farm-step">owner funds the wallet</span>
            <em>{farm.loop.secondsToRating}s</em>
            <span className="farm-step">wallet rates the agent</span>
            <em>{farm.loop.secondsToReturn}s</em>
            <span className="farm-step">money goes back</span>
          </div>
          <p className="farm-loop-note">
            Median timings across all {farm.loop.wallets.toLocaleString()} wallets on agent
            #{farm.loop.agentId}. {farm.loop.monOut.toLocaleString()} MON went out and{" "}
            {farm.loop.monBack.toLocaleString()} came back, a median of {farm.loop.monMedian} MON a
            wallet, so the whole campaign cost its owner the difference plus gas. The registry
            recorded it as {farm.loop.wallets.toLocaleString()} opinions.
          </p>
        </div>
      )}
    </section>
  );
}
