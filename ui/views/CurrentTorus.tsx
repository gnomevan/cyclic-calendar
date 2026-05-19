import { useEffect, useMemo, useState } from "react";
import {
  lunarWheel,
  now,
  pleiadesWheel,
  solarWheel,
  toGregorianUTC,
  type Anchor,
  type Instant,
  type Wheel,
} from "../../src/index.js";

/**
 * Current Torus — the v1 landing view.
 *
 * Three cards, one per wheel: the wheel's angle right now, plus a short
 * list of the next universal anchors on that wheel with their projected
 * Gregorian timestamps. No persistence; this view is pure computation
 * from the wheels.
 *
 * The clock ticks once a minute. Wheel positions move slowly (the
 * fastest is lunar phase at ~12°/day), so finer granularity would
 * waste renders.
 */
export function CurrentTorus() {
  const [instant, setInstant] = useState<Instant>(() => now());

  useEffect(() => {
    const id = window.setInterval(() => setInstant(now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <WheelCard wheel={solarWheel} at={instant} />
      <WheelCard wheel={lunarWheel} at={instant} />
      <WheelCard wheel={pleiadesWheel} at={instant} />
    </>
  );
}

interface WheelCardProps {
  wheel: Wheel;
  at: Instant;
}

function WheelCard({ wheel, at }: WheelCardProps) {
  const upcoming = useMemo(() => upcomingAnchors(wheel, at, 4), [wheel, at]);
  const angle = wheel.positionAt(at);

  return (
    <section className="wheel-card">
      <div className="wheel-kind">{wheel.kind}</div>
      <h2>{wheel.name}</h2>
      <div className="current-angle">{angle.toFixed(2)}°</div>
      {upcoming.length === 0 ? (
        <p className="error">No anchors defined on this wheel.</p>
      ) : (
        <ul className="anchor-list">
          {upcoming.map(({ anchor, when }) => (
            <li key={anchor.id}>
              <span className="anchor-name">{anchor.name}</span>
              <span className="anchor-when">{when}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface UpcomingAnchor {
  anchor: Anchor;
  when: string;
}

/**
 * Find the next `limit` universal anchors on the wheel, ordered by when
 * each one next occurs after the reference instant. Returns the anchor
 * and a Gregorian-projected display string for the crossing.
 */
function upcomingAnchors(
  wheel: Wheel,
  after: Instant,
  limit: number,
): UpcomingAnchor[] {
  const candidates: { anchor: Anchor; raw: Instant }[] = [];
  for (const anchor of wheel.anchors) {
    const crossing = wheel.nextCrossing(anchor.angle, after);
    if (crossing === null) continue;
    candidates.push({ anchor, raw: crossing });
  }
  return candidates
    .sort((a, b) => a.raw - b.raw)
    .slice(0, limit)
    .map(({ anchor, raw }) => ({ anchor, when: formatGregorian(raw) }));
}

function formatGregorian(at: Instant): string {
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${g.year}-${pad(g.month)}-${pad(g.day)} ${pad(g.hour)}:${pad(g.minute)} UTC`;
}
