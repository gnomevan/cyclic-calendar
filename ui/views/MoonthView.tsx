import { useEffect, useMemo, useState } from "react";
import {
  epochMs,
  instantFromEpochMs,
  lunarWheel,
  now,
  resolve,
  solarWheel,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { DayCard } from "../components/DayCard.js";
import { findRecentNewMoon } from "../components/ConcentricOverview.js";
import { useEvents } from "../store.js";
import { wheelRegistry } from "../wheels.js";

/**
 * MoonthView — the cycles-first daily-use canvas.
 *
 * 28 day cards arranged on a clock face, starting at the most recent
 * new moon and walking 27 days forward. Behind them, a wide faint arc
 * of the solar year — enough of the arc to show where this moonth
 * sits within the year, with nearby solar anchors marked.
 *
 * Today's card is highlighted. The moon glyph on each card reflects
 * the lunar wheel's actual phase angle for the noon of that day, so
 * the eye can sweep around the clock and see the moon waxing and
 * waning the way it does in life.
 */

const DAYS_IN_MOONTH = 28;
const CANVAS_SIZE = 760;
const CENTER = CANVAS_SIZE / 2;
const CARD_RING_RADIUS = 270;
const CARD_SIZE = 112;
const SOLAR_ARC_INNER_R = 340;
const SOLAR_ARC_OUTER_R = 372;
const SOLAR_LABEL_R = 358;

const SOLAR_ANCHOR_SHORT: Record<string, string> = {
  spring_equinox: "Spring",
  beltane: "Beltane",
  summer_solstice: "Summer",
  lughnasadh: "Lughnasadh",
  autumn_equinox: "Autumn",
  samhain: "Samhain",
  winter_solstice: "Winter",
  imbolc: "Imbolc",
};

export function MoonthView() {
  const events = useEvents();
  const [nowInstant, setNowInstant] = useState<Instant>(() => now());

  useEffect(() => {
    const id = window.setInterval(() => setNowInstant(now()), 300_000);
    return () => window.clearInterval(id);
  }, []);

  const moonthStart = useMemo(() => findRecentNewMoon(nowInstant), [nowInstant]);

  // Build the 28 day instants, anchored at noon UTC of each day so
  // the moon-phase reading isn't dominated by the midnight rollover.
  const days = useMemo<DayInfo[]>(() => {
    const startNoonMs = midnightUtc(moonthStart) + 12 * 60 * 60 * 1000;
    const todayNoonMs = midnightUtc(nowInstant) + 12 * 60 * 60 * 1000;
    return Array.from({ length: DAYS_IN_MOONTH }, (_, i) => {
      const at = instantFromEpochMs(startNoonMs + i * 86_400_000);
      const phase = lunarWheel.positionAt(at);
      return {
        at,
        moonAngle: phase,
        moonthDay: i + 1,
        isToday: midnightUtc(at) + 12 * 60 * 60 * 1000 === todayNoonMs,
      };
    });
  }, [moonthStart, nowInstant]);

  const moonthEndExclusive = useMemo(
    () => instantFromEpochMs(epochMs(days[DAYS_IN_MOONTH - 1]!.at) + 86_400_000),
    [days],
  );

  // Group events by which day-of-moonth they fall on (if any).
  const eventsByDay = useMemo(
    () => groupEventsByDay(events, days[0]!.at, moonthEndExclusive),
    [events, days, moonthEndExclusive],
  );

  // Solar arc: render a generous span around the current moonth (±90 days)
  // so the user sees several solar anchors as context, with the active
  // moonth segment emphasized.
  const solar = useMemo(() => computeSolarArc(moonthStart, moonthEndExclusive), [moonthStart, moonthEndExclusive]);

  return (
    <section className="moonth-view">
      <header className="moonth-header">
        <div>
          <h2>This moonth</h2>
          <p className="moonth-caption">
            28 days from the most recent new moon ({formatDate(days[0]!.at)})
            to the next ({formatDate(days[DAYS_IN_MOONTH - 1]!.at)}). The arc
            behind is the solar year; the brighter segment is where this
            moonth lives.
          </p>
        </div>
      </header>

      <div className="moonth-canvas-wrap">
        <svg
          viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
          className="moonth-canvas"
          role="img"
          aria-label="The current moonth"
        >
          {/* Solar arc backdrop */}
          <SolarArcBackdrop solar={solar} />

          {/* Today radial pointer */}
          <TodayPointer
            instant={nowInstant}
            moonthStart={moonthStart}
            moonthEndExclusive={moonthEndExclusive}
          />
        </svg>

        {/* Day cards positioned absolutely over the SVG using the same
            polar math. They are HTML for accessibility and event handling. */}
        <div className="moonth-cards">
          {days.map((d) => {
            const angle = (d.moonthDay - 1) * (360 / DAYS_IN_MOONTH);
            const p = polar(CENTER, CENTER, CARD_RING_RADIUS, angle);
            return (
              <div
                key={d.moonthDay}
                className="moonth-card-slot"
                style={{
                  left: `calc(${(p.x / CANVAS_SIZE) * 100}% - ${CARD_SIZE / 2}px)`,
                  top: `calc(${(p.y / CANVAS_SIZE) * 100}% - ${CARD_SIZE / 2}px)`,
                }}
              >
                <DayCard
                  moonthDay={d.moonthDay}
                  moonAngle={d.moonAngle}
                  at={d.at}
                  isToday={d.isToday}
                  events={eventsByDay.get(d.moonthDay) ?? []}
                  size={CARD_SIZE}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----- subcomponents -------------------------------------------------- */

interface SolarArcInfo {
  midDeg: number;
  rangeDeg: number;
  anchors: { id: string; angleOnArc: number; label: string }[];
}

function SolarArcBackdrop({ solar }: { solar: SolarArcInfo }) {
  // Arc endpoints
  const startDeg = -solar.rangeDeg / 2;
  const endDeg = solar.rangeDeg / 2;
  const arcOuter = describeArc(CENTER, CENTER, SOLAR_ARC_OUTER_R, startDeg, endDeg);
  const arcInner = describeArc(CENTER, CENTER, SOLAR_ARC_INNER_R, startDeg, endDeg);
  const arcMid = describeArc(CENTER, CENTER, (SOLAR_ARC_INNER_R + SOLAR_ARC_OUTER_R) / 2, startDeg, endDeg);

  return (
    <g>
      {/* Faint outer and inner edges of the arc */}
      <path d={arcOuter} fill="none" stroke="#1f232b" strokeWidth={1} />
      <path d={arcInner} fill="none" stroke="#1f232b" strokeWidth={1} />
      <path d={arcMid} fill="none" stroke="#1f232b" strokeWidth={0.5} opacity={0.6} />

      {/* Active moonth segment within the arc (the "now" patch) */}
      {(() => {
        const halfWindow = DAYS_IN_MOONTH * (360 / 365.2422) / 2;
        const active = describeArc(
          CENTER,
          CENTER,
          (SOLAR_ARC_INNER_R + SOLAR_ARC_OUTER_R) / 2,
          -halfWindow,
          halfWindow,
        );
        return (
          <path
            d={active}
            fill="none"
            stroke="#d4a373"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.7}
          />
        );
      })()}

      {/* Solar anchors visible within the rendered arc range */}
      {solar.anchors.map((a) => {
        const p = polar(CENTER, CENTER, (SOLAR_ARC_INNER_R + SOLAR_ARC_OUTER_R) / 2, a.angleOnArc);
        const labelP = polar(CENTER, CENTER, SOLAR_LABEL_R + 8, a.angleOnArc);
        const tickInner = polar(CENTER, CENTER, SOLAR_ARC_INNER_R - 4, a.angleOnArc);
        const tickOuter = polar(CENTER, CENTER, SOLAR_ARC_OUTER_R + 4, a.angleOnArc);
        return (
          <g key={a.id}>
            <line x1={tickInner.x} y1={tickInner.y} x2={tickOuter.x} y2={tickOuter.y} stroke="#5a5f6a" strokeWidth={1} />
            <circle cx={p.x} cy={p.y} r={2} fill="#8a8f99" />
            <text
              x={labelP.x}
              y={labelP.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fill="#8a8f99"
            >
              {a.label}
            </text>
          </g>
        );
      })}

      {/* Small center label */}
      <text x={CENTER} y={CENTER - 6} textAnchor="middle" fontSize="11" fill="#5a5f6a">
        solar year
      </text>
      <text x={CENTER} y={CENTER + 10} textAnchor="middle" fontSize="11" fill="#5a5f6a">
        (context arc)
      </text>
    </g>
  );
}

function TodayPointer({
  instant,
  moonthStart,
  moonthEndExclusive,
}: {
  instant: Instant;
  moonthStart: Instant;
  moonthEndExclusive: Instant;
}) {
  const totalMs = epochMs(moonthEndExclusive) - epochMs(moonthStart);
  const elapsedMs = epochMs(instant) - epochMs(moonthStart);
  if (elapsedMs < 0 || elapsedMs > totalMs) return null;
  const frac = elapsedMs / totalMs;
  const angle = frac * 360;
  const inner = polar(CENTER, CENTER, 36, angle);
  const outer = polar(CENTER, CENTER, CARD_RING_RADIUS - CARD_SIZE / 2 - 6, angle);
  return (
    <line
      x1={inner.x}
      y1={inner.y}
      x2={outer.x}
      y2={outer.y}
      stroke="#d4a373"
      strokeWidth={1.5}
      strokeLinecap="round"
      opacity={0.7}
    />
  );
}

/* ----- helpers -------------------------------------------------------- */

interface DayInfo {
  at: Instant;
  moonAngle: number;
  moonthDay: number;
  isToday: boolean;
}

function midnightUtc(at: Instant): number {
  const ms = epochMs(at);
  return ms - (ms % 86_400_000);
}

function formatDate(at: Instant): string {
  const g = toGregorianUTC(at);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[g.month - 1]} ${g.day}`;
}

function polar(cx: number, cy: number, r: number, degreesFromTop: number) {
  const rad = (degreesFromTop * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const sweep = endDeg - startDeg;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * The visible solar arc range. We render ±90 days of solar arc centered
 * on the middle of the moonth, so several anchors usually show.
 */
function computeSolarArc(moonthStart: Instant, moonthEnd: Instant): SolarArcInfo {
  const midMs = (epochMs(moonthStart) + epochMs(moonthEnd)) / 2;
  const mid = instantFromEpochMs(midMs);
  const midSolarAngle = solarWheel.positionAt(mid);

  const halfRangeDays = 90;
  const dayDeg = 360 / 365.2422;
  const rangeDeg = halfRangeDays * 2 * dayDeg;

  // Find solar anchors whose absolute angular distance from mid is within ±rangeDeg/2.
  const anchors: SolarArcInfo["anchors"] = [];
  for (const anchor of solarWheel.anchors) {
    // Signed angular distance from mid to anchor, in (-180, 180].
    let d = anchor.angle - midSolarAngle;
    d = ((d + 540) % 360) - 180;
    if (Math.abs(d) > rangeDeg / 2) continue;
    anchors.push({ id: anchor.id, angleOnArc: d, label: SOLAR_ANCHOR_SHORT[anchor.id] ?? anchor.name });
  }

  return { midDeg: midSolarAngle, rangeDeg, anchors };
}

/**
 * Bucket user events into day-of-moonth slots by resolving each event
 * forward and checking which day it falls on within the window.
 */
function groupEventsByDay(
  events: CalendarEvent[],
  moonthStart: Instant,
  moonthEndExclusive: Instant,
): Map<number, CalendarEvent[]> {
  const startMs = epochMs(moonthStart);
  const endMs = epochMs(moonthEndExclusive);
  const result = new Map<number, CalendarEvent[]>();

  for (const event of events) {
    let cursor = moonthStart;
    // A bounded loop — most events resolve to 0 or 1 occurrences in
    // a 28-day window; 35 covers the worst-case daily wheel.
    for (let i = 0; i < 35; i++) {
      let resolved;
      try {
        resolved = resolve(event.rule, { registry: wheelRegistry, from: cursor });
      } catch {
        break;
      }
      if (!resolved) break;
      const ms = epochMs(resolved.at);
      if (ms >= endMs) break;
      const dayIndex = Math.floor((ms - startMs) / 86_400_000);
      const dayNum = dayIndex + 1;
      if (dayNum >= 1 && dayNum <= DAYS_IN_MOONTH) {
        const list = result.get(dayNum) ?? [];
        list.push(event);
        result.set(dayNum, list);
      }
      if (ms <= epochMs(cursor)) break;
      cursor = instantFromEpochMs(ms + 1000);
    }
  }
  return result;
}
