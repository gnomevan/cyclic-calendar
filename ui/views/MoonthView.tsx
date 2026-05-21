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
 * MoonthView — user-centric, perspective-tilted moonth wheel.
 *
 * The 28-day moonth wraps around a horizontal ellipse, viewed from
 * slightly below — like looking at a tilted dial. The focused day
 * (today by default) sits at the bottom-center, closest to the
 * viewer, biggest. Recent days fan off to the left, upcoming days to
 * the right. Cards scale down and fade as they recede into the back
 * of the wheel; the card opposite today (~14 days away on the cycle)
 * is smallest and dimmest.
 *
 * Behind the moonth wheel, a much larger concentric solar-year arc
 * is drawn — a tilted ellipse on the same perspective, with the
 * eight cardinal solar anchors marked, and the segment occupied by
 * this moonth highlighted in accent color. The solar arc is bold
 * enough to read at a glance: it answers "where in the year are we?"
 * without leaving the moonth view.
 */

const DAYS_IN_MOONTH = 28;

const CANVAS_W = 940;
const CANVAS_H = 620;
const CENTER_X = CANVAS_W / 2;
const CENTER_Y = CANVAS_H * 0.55;

// Moonth wheel: a tilted ellipse, today at bottom.
const MOON_RX = 350;
const MOON_RY = 175;

// Solar year wheel: a larger concentric tilted ellipse, behind.
const SOLAR_RX = 440;
const SOLAR_RY = 220;

const CARD_BASE_SIZE = 118;
const SCALE_MIN = 0.42;
const OPACITY_MIN = 0.32;

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

  // Find today's day-in-moonth (1..28). Default to day 1 if "today"
  // somehow isn't in the window (e.g., we just rolled past day 28 and
  // findRecentNewMoon hasn't caught up by a hair).
  const focusDay = useMemo(() => days.find((d) => d.isToday)?.moonthDay ?? 1, [days]);
  const moonthEndExclusive = useMemo(
    () => instantFromEpochMs(epochMs(days[DAYS_IN_MOONTH - 1]!.at) + 86_400_000),
    [days],
  );

  const eventsByDay = useMemo(
    () => groupEventsByDay(events, days[0]!.at, moonthEndExclusive),
    [events, days, moonthEndExclusive],
  );

  const solar = useMemo(
    () => computeSolarMarkers(days[0]!.at, days[DAYS_IN_MOONTH - 1]!.at, nowInstant),
    [days, nowInstant],
  );

  // Compute each card's geometry. Sort by depth so back cards render
  // first (so close cards layer over far ones).
  const placedCards = useMemo(() => {
    return days
      .map((d) => {
        const angle = bottomCenteredAngle(d.moonthDay, focusDay);
        const rad = (angle * Math.PI) / 180;
        const x = CENTER_X + MOON_RX * Math.sin(rad);
        const y = CENTER_Y - MOON_RY * Math.cos(rad);
        // depth t: 0 at bottom (focused), 1 at top (opposite).
        const t = (1 - Math.cos(((angle - 180) * Math.PI) / 180)) / 2;
        const scale = 1 - (1 - SCALE_MIN) * t;
        const opacity = 1 - (1 - OPACITY_MIN) * t;
        // z-stacking: cards with larger y are in front.
        return { day: d, x, y, scale, opacity, depth: t };
      })
      .sort((a, b) => b.depth - a.depth); // farthest first
  }, [days, focusDay]);

  return (
    <section className="moonth-view">
      <header className="moonth-header">
        <div>
          <h2>This moonth</h2>
          <p className="moonth-caption">
            28 days from the most recent new moon ({formatDate(days[0]!.at)})
            to the next ({formatDate(days[DAYS_IN_MOONTH - 1]!.at)}). Today is
            at the front; recent days are to the left, days ahead to the right.
          </p>
        </div>
      </header>

      <div className="moonth-canvas-wrap">
        <svg
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="moonth-canvas"
          role="img"
          aria-label="The current moonth"
          preserveAspectRatio="xMidYMid meet"
        >
          <SolarBackdrop solar={solar} />
        </svg>

        <div className="moonth-cards">
          {placedCards.map(({ day, x, y, scale, opacity }) => (
            <div
              key={day.moonthDay}
              className="moonth-card-slot"
              style={{
                left: `calc(${(x / CANVAS_W) * 100}% - ${CARD_BASE_SIZE / 2}px)`,
                top: `calc(${(y / CANVAS_H) * 100}% - ${CARD_BASE_SIZE / 2}px)`,
                transform: `scale(${scale})`,
                opacity,
                zIndex: Math.round(y),
              }}
            >
              <DayCard
                moonthDay={day.moonthDay}
                moonAngle={day.moonAngle}
                at={day.at}
                isToday={day.isToday}
                events={eventsByDay.get(day.moonthDay) ?? []}
                size={CARD_BASE_SIZE}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- Solar arc backdrop -------------------------------------------- */

interface SolarMarker {
  id: string;
  label: string;
  ringAngle: number;
}

interface SolarMarkersInfo {
  markers: SolarMarker[];
  moonthArcStartAngle: number; // angle on the moonth wheel where moonth-start sits
  moonthArcEndAngle: number;
  moonthMidAngle: number;
}

function SolarBackdrop({ solar }: { solar: SolarMarkersInfo }) {
  // Faint full year ellipse.
  const fullRing = describeEllipseFull(CENTER_X, CENTER_Y, SOLAR_RX, SOLAR_RY);
  // The active moonth segment, drawn brightly on the solar ellipse.
  const active = describeEllipseArc(
    CENTER_X,
    CENTER_Y,
    SOLAR_RX,
    SOLAR_RY,
    solar.moonthArcStartAngle,
    solar.moonthArcEndAngle,
  );

  return (
    <g className="solar-backdrop">
      {/* Soft halo behind the active segment */}
      <path
        d={describeEllipseArc(
          CENTER_X,
          CENTER_Y,
          SOLAR_RX,
          SOLAR_RY,
          solar.moonthArcStartAngle - 6,
          solar.moonthArcEndAngle + 6,
        )}
        fill="none"
        stroke="#d4a373"
        strokeWidth={18}
        strokeLinecap="round"
        opacity={0.12}
      />

      {/* The full solar year ring — faint */}
      <path d={fullRing} fill="none" stroke="#3a3f4a" strokeWidth={1.5} />

      {/* The active moonth segment */}
      <path d={active} fill="none" stroke="#d4a373" strokeWidth={5} strokeLinecap="round" opacity={0.85} />

      {/* Solar anchors as labeled markers */}
      {solar.markers.map((m) => {
        const inner = ellipsePoint(CENTER_X, CENTER_Y, SOLAR_RX - 12, SOLAR_RY - 8, m.ringAngle);
        const outer = ellipsePoint(CENTER_X, CENTER_Y, SOLAR_RX + 12, SOLAR_RY + 8, m.ringAngle);
        const labelPos = ellipsePoint(CENTER_X, CENTER_Y, SOLAR_RX + 38, SOLAR_RY + 30, m.ringAngle);
        return (
          <g key={m.id}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#9aa0ab" strokeWidth={1.5} />
            <circle cx={outer.x} cy={outer.y} r={3.5} fill="#cdd5e0" />
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="13"
              fill="#cdd5e0"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {m.label}
            </text>
          </g>
        );
      })}

      {/* "Today" pointer from solar ring down to moonth front */}
      <SolarTodayPointer />

      {/* Solar-year caption */}
      <text
        x={CENTER_X}
        y={CANVAS_H - 14}
        textAnchor="middle"
        fontSize="11"
        fill="#8a8f99"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        solar year ↻
      </text>
    </g>
  );
}

function SolarTodayPointer() {
  // A small mark above the front of the moonth wheel, on the solar ring.
  const onSolar = ellipsePoint(CENTER_X, CENTER_Y, SOLAR_RX, SOLAR_RY, 180);
  return (
    <g>
      <line
        x1={onSolar.x}
        y1={onSolar.y - 4}
        x2={onSolar.x}
        y2={onSolar.y - 20}
        stroke="#d4a373"
        strokeWidth={1.5}
      />
      <text
        x={onSolar.x}
        y={onSolar.y - 26}
        textAnchor="middle"
        fontSize="11"
        fill="#d4a373"
        fontFamily="ui-monospace, monospace"
      >
        now
      </text>
    </g>
  );
}

/* ----- helpers ------------------------------------------------------- */

interface DayInfo {
  at: Instant;
  moonAngle: number;
  moonthDay: number;
  isToday: boolean;
}

/**
 * Where on the moonth wheel does day `d` sit, given that day `focus`
 * is at the bottom (angle 180°). Past days fan to the left (greater
 * angles, since +angle in our convention goes 180° → 270° = bottom →
 * left). Future days fan to the right.
 *
 * Cyclic wrap: relative is taken in (-14, 14] so the result is
 * stable across moonth boundaries.
 */
function bottomCenteredAngle(d: number, focus: number): number {
  let rel = d - focus;
  // Wrap into (-14, 14].
  while (rel > 14) rel -= DAYS_IN_MOONTH;
  while (rel <= -14) rel += DAYS_IN_MOONTH;
  // Future (rel > 0) goes right → decreasing angle from 180°.
  return 180 - rel * (360 / DAYS_IN_MOONTH);
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

function ellipsePoint(cx: number, cy: number, rx: number, ry: number, degreesFromTop: number) {
  const rad = (degreesFromTop * Math.PI) / 180;
  return { x: cx + rx * Math.sin(rad), y: cy - ry * Math.cos(rad) };
}

function describeEllipseFull(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx - 0.001} ${cy - ry} Z`;
}

function describeEllipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = ellipsePoint(cx, cy, rx, ry, startDeg);
  const end = ellipsePoint(cx, cy, rx, ry, endDeg);
  const sweep = endDeg - startDeg;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  const sweepFlag = sweep >= 0 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${rx} ${ry} 0 ${largeArc} ${sweepFlag} ${end.x} ${end.y}`;
}

/**
 * For each solar anchor, compute the angle on the moonth/solar wheel
 * (using the same bottom-centered convention) at which the anchor
 * lies. Plus the start/end of the active moonth segment on that ring.
 *
 * The trick: both the moonth and the solar ring use the same angular
 * convention. The moonth's "now" is at angle 180°. The solar
 * anchors' angular positions on the solar ring are computed by
 * mapping their solar-wheel angles relative to "now" — i.e., how far
 * away (in days, then projected to the ring) is each anchor from
 * today.
 */
function computeSolarMarkers(moonthStart: Instant, moonthLastDay: Instant, now: Instant): SolarMarkersInfo {
  // The solar ring represents the FULL year, with "now" at the
  // bottom. An anchor's position on the ring = signed days from now,
  // mapped to ±180°.
  const dayMs = 86_400_000;
  const yearDays = 365.2422;

  function angleForInstant(at: Instant): number {
    const days = (epochMs(at) - epochMs(now)) / dayMs;
    // Days ahead → right (angle decreases from 180°). Days behind →
    // left (angle increases from 180°). Wrap into (-180, 180].
    let signed = days;
    // No wrap really needed since |days| < ~180 for the markers we plot
    let angle = 180 - signed * (360 / yearDays);
    // Normalize to [0, 360).
    angle = ((angle % 360) + 360) % 360;
    return angle;
  }

  // Find the next instance of each solar anchor in the +/-180 days window
  // around `now`. Since solar anchors recur once a year, we use solarWheel.nextCrossing
  // from a point 200 days in the past and accept the result if it falls within
  // the window.
  const windowStartMs = epochMs(now) - 200 * dayMs;
  const windowEndMs = epochMs(now) + 200 * dayMs;
  const start = instantFromEpochMs(windowStartMs);
  const markers: SolarMarker[] = [];
  for (const anchor of solarWheel.anchors) {
    let cursor = start;
    for (let i = 0; i < 3; i++) {
      const next = solarWheel.nextCrossing(anchor.angle, cursor);
      if (next === null) break;
      const ms = epochMs(next);
      if (ms > windowEndMs) break;
      if (ms >= windowStartMs) {
        markers.push({
          id: `${anchor.id}-${ms}`,
          label: SOLAR_ANCHOR_SHORT[anchor.id] ?? anchor.name,
          ringAngle: angleForInstant(next),
        });
      }
      cursor = next;
    }
  }

  return {
    markers,
    moonthArcStartAngle: angleForInstant(moonthStart),
    moonthArcEndAngle: angleForInstant(instantFromEpochMs(epochMs(moonthLastDay) + dayMs)),
    moonthMidAngle: 180,
  };
}

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
