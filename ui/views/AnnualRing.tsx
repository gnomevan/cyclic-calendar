import { useEffect, useMemo, useState } from "react";
import {
  epochMs,
  instantFromEpochMs,
  lunarWheel,
  now,
  pleiadesWheel,
  resolve,
  solarWheel,
  toGregorianUTC,
  type Anchor,
  type CalendarEvent,
  type Instant,
  type Wheel,
} from "../../src/index.js";
import { useEvents } from "../store.js";
import { wheelRegistry } from "../wheels.js";

/**
 * Annual Ring — a circular projection of the next 365 days from "now".
 *
 * The ring is a *time* ring, not an *angle* ring: position around it
 * represents elapsed fraction of the year, regardless of which wheel an
 * anchor lives on. "Now" sits at the top (12 o'clock); time flows
 * clockwise; the full circle is exactly 365 days ahead.
 *
 * Four bands are plotted simultaneously, outermost first: user events
 * (warm orange), solar (~8 anchors/year, gold), Pleiades (2/year, violet),
 * and lunar phase (~13×/year per phase, silver). User events get their
 * own outer band so they read as peer to the astronomical wheels rather
 * than overlaying them.
 */

const SIZE = 540;
const CENTER = SIZE / 2;
const USER_RADIUS = 248;
const SOLAR_RADIUS = 208;
const PLEIADES_RADIUS = 168;
const LUNAR_RADIUS = 128;
const TICK_LENGTH = 14;
const LUNAR_TICK = 8;
const USER_TICK = 18;
const MONTH_LABEL_RADIUS = 278;
const SPAN_DAYS = 365;
const MAX_EVENT_OCCURRENCES = 30;

const PALETTE = {
  solar: "#f4a261",
  lunar: "#cdd5e0",
  pleiades: "#a78bfa",
  user: "#e76f51",
  ring: "#1f232b",
  ringSoft: "#161a21",
  ringUser: "#2a2620",
  now: "#d4a373",
  monthLine: "#2a2f38",
  monthLabel: "#8a8f99",
};

export function AnnualRing() {
  const [from, setFrom] = useState<Instant>(() => now());
  const events = useEvents();

  useEffect(() => {
    // Once an hour is plenty — the ring spans a year. A finer tick would
    // just shift the now-marker imperceptibly.
    const id = window.setInterval(() => setFrom(now()), 3_600_000);
    return () => window.clearInterval(id);
  }, []);

  const wheels = useMemo(
    () =>
      [
        { wheel: solarWheel,    radius: SOLAR_RADIUS,    color: PALETTE.solar,    tick: TICK_LENGTH },
        { wheel: pleiadesWheel, radius: PLEIADES_RADIUS, color: PALETTE.pleiades, tick: TICK_LENGTH },
        { wheel: lunarWheel,    radius: LUNAR_RADIUS,    color: PALETTE.lunar,    tick: LUNAR_TICK  },
      ] as const,
    [],
  );

  const months = useMemo(() => monthTicks(from, SPAN_DAYS), [from]);

  const occurrences = useMemo(
    () => wheels.flatMap(({ wheel, radius, color, tick }) =>
      anchorsInWindow(wheel, from, SPAN_DAYS).map((occ) => ({
        ...occ,
        radius,
        color,
        tickLength: tick,
      })),
    ),
    [from, wheels],
  );

  const eventOccurrences = useMemo(
    () => events.flatMap((event) => eventOccurrencesInWindow(event, from, SPAN_DAYS)),
    [events, from],
  );

  return (
    <section className="wheel-card annual-ring">
      <div className="wheel-kind">composite</div>
      <h2>The Year Ahead</h2>
      <p className="ring-caption">
        The next 365 days. Now is at the top; time runs clockwise.
      </p>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ring-svg" role="img" aria-label="Annual ring">
        <circle cx={CENTER} cy={CENTER} r={USER_RADIUS}     fill="none" stroke={PALETTE.ringUser} strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={SOLAR_RADIUS}    fill="none" stroke={PALETTE.ring}     strokeWidth={1.5} />
        <circle cx={CENTER} cy={CENTER} r={PLEIADES_RADIUS} fill="none" stroke={PALETTE.ringSoft} strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={LUNAR_RADIUS}    fill="none" stroke={PALETTE.ringSoft} strokeWidth={1} />

        {months.map(({ degrees, label }) => {
          const inner = polarToCartesian(CENTER, CENTER, LUNAR_RADIUS - 16, degrees);
          const outer = polarToCartesian(CENTER, CENTER, USER_RADIUS + 6, degrees);
          const labelAt = polarToCartesian(CENTER, CENTER, MONTH_LABEL_RADIUS, degrees);
          return (
            <g key={label + degrees}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={PALETTE.monthLine} strokeWidth={1} />
              <text x={labelAt.x} y={labelAt.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill={PALETTE.monthLabel}>
                {label}
              </text>
            </g>
          );
        })}

        {occurrences.map(({ anchor, at, radius, color, tickLength }) => {
          const degrees = ringDegrees(at, from, SPAN_DAYS);
          const a = polarToCartesian(CENTER, CENTER, radius - tickLength / 2, degrees);
          const b = polarToCartesian(CENTER, CENTER, radius + tickLength / 2, degrees);
          return (
            <line
              key={`${anchor.wheelId}-${anchor.id}-${epochMs(at)}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
            >
              <title>{`${anchor.name} — ${formatGregorian(at)}`}</title>
            </line>
          );
        })}

        {eventOccurrences.map(({ event, at }) => {
          const degrees = ringDegrees(at, from, SPAN_DAYS);
          const a = polarToCartesian(CENTER, CENTER, USER_RADIUS - USER_TICK / 2, degrees);
          const b = polarToCartesian(CENTER, CENTER, USER_RADIUS + USER_TICK / 2, degrees);
          return (
            <line
              key={`${event.id}-${epochMs(at)}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={PALETTE.user}
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <title>{`${event.name} — ${formatGregorian(at)}`}</title>
            </line>
          );
        })}

        <NowMarker />
      </svg>

      <ul className="ring-legend">
        <li><span className="swatch" style={{ background: PALETTE.user }} /> Your events</li>
        <li><span className="swatch" style={{ background: PALETTE.solar }} /> Solar</li>
        <li><span className="swatch" style={{ background: PALETTE.pleiades }} /> Pleiades</li>
        <li><span className="swatch" style={{ background: PALETTE.lunar }} /> Lunar phase</li>
      </ul>
    </section>
  );
}

function NowMarker() {
  const top = polarToCartesian(CENTER, CENTER, SOLAR_RADIUS + 14, 0);
  return (
    <>
      <circle cx={top.x} cy={top.y} r={5} fill={PALETTE.now} />
      <text x={top.x} y={top.y - 12} textAnchor="middle" fontSize="11" fill={PALETTE.now}>
        now
      </text>
    </>
  );
}

/* ----- geometry & data helpers ---------------------------------------- */

interface AnchorOccurrence {
  anchor: Anchor;
  at: Instant;
}

function anchorsInWindow(
  wheel: Wheel,
  after: Instant,
  daysAhead: number,
): AnchorOccurrence[] {
  const endMs = epochMs(after) + daysAhead * 86_400_000;
  const occurrences: AnchorOccurrence[] = [];
  for (const anchor of wheel.anchors) {
    let cursor = after;
    // Safety bound: lunar phases recur ~13×/year, so 20 iterations is
    // plenty for any single anchor within a year window.
    for (let i = 0; i < 20; i++) {
      const next = wheel.nextCrossing(anchor.angle, cursor);
      if (next === null) break;
      if (epochMs(next) > endMs) break;
      occurrences.push({ anchor, at: next });
      cursor = next;
    }
  }
  return occurrences;
}

interface EventOccurrence {
  event: CalendarEvent;
  at: Instant;
}

/**
 * Resolve a user event repeatedly, walking forward from `after`, until
 * either MAX_EVENT_OCCURRENCES are found, the resolution falls outside
 * the window, or the resolver returns null. The cap protects against
 * pathological rules (or a future bug) producing an unbounded list.
 */
function eventOccurrencesInWindow(
  event: CalendarEvent,
  after: Instant,
  daysAhead: number,
): EventOccurrence[] {
  const endMs = epochMs(after) + daysAhead * 86_400_000;
  const occurrences: EventOccurrence[] = [];
  let cursor = after;
  for (let i = 0; i < MAX_EVENT_OCCURRENCES; i++) {
    let resolved;
    try {
      resolved = resolve(event.rule, { registry: wheelRegistry, from: cursor });
    } catch {
      return occurrences; // bad rule — surface what we have, don't crash the ring
    }
    if (!resolved) break;
    if (epochMs(resolved.at) > endMs) break;
    if (epochMs(resolved.at) <= epochMs(cursor)) break; // resolver didn't advance — abort
    occurrences.push({ event, at: resolved.at });
    cursor = instantFromEpochMs(epochMs(resolved.at) + 1000);
  }
  return occurrences;
}

interface MonthTick {
  degrees: number;
  label: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Returns one tick per month-boundary that falls within the next
 * `daysAhead` days, plus a tick for the current month (placed at "now"
 * if it would otherwise be missed). Labels are the month name at the
 * tick instant.
 */
function monthTicks(from: Instant, daysAhead: number): MonthTick[] {
  const startG = toGregorianUTC(from);
  const ticks: MonthTick[] = [];
  for (let i = 0; i < 13; i++) {
    let year = startG.year;
    let month = startG.month + i;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    const tickInstant = instantFromEpochMs(Date.UTC(year, month - 1, 1));
    const degrees = ringDegrees(tickInstant, from, daysAhead);
    if (degrees < 0 || degrees > 360) continue;
    ticks.push({ degrees, label: MONTH_NAMES[month - 1]! });
  }
  return ticks;
}

function ringDegrees(at: Instant, start: Instant, daysSpan: number): number {
  const elapsedDays = (epochMs(at) - epochMs(start)) / 86_400_000;
  return (elapsedDays / daysSpan) * 360;
}

function polarToCartesian(cx: number, cy: number, r: number, degreesFromTop: number) {
  const rad = (degreesFromTop * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

function formatGregorian(at: Instant): string {
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${g.year}-${pad(g.month)}-${pad(g.day)} ${pad(g.hour)}:${pad(g.minute)} UTC`;
}
