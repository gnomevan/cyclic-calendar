import { useEffect, useMemo, useState } from "react";
import {
  epochMs,
  instantFromEpochMs,
  lunarWheel,
  now,
  resolve,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { DayCard } from "../components/DayCard.js";
import { findRecentNewMoon } from "../components/ConcentricOverview.js";
import { SolarYearTrack } from "../components/SolarYearTrack.js";
import { useEvents } from "../store.js";
import { wheelRegistry } from "../wheels.js";

/**
 * MoonthView — user-centric, perspective-tilted moonth wheel, with
 * the solar year laid out vertically alongside.
 *
 * Layout: a vertical SolarYearTrack on the left (the year-spine,
 * with solar anchors as labeled stops) + a moonth wheel on the right
 * (today at the bottom-center, recent days fanning left, upcoming
 * fanning right). Cards on the wheel are portrait rectangles narrow
 * enough that five of them fit cleanly at the front without overlap;
 * cards toward the back of the wheel scale down and fade out.
 *
 * Above and below the wheel, small "previous moonth" and "next
 * moonth" indicators set up the vertical-scroll model — multiple
 * moonths along the year-spine — which the next iteration will fill
 * in with real adjacent-moonth wheels.
 */

const DAYS_IN_MOONTH = 28;

const CANVAS_W = 800;
const CANVAS_H = 580;
const CENTER_X = CANVAS_W / 2;
const CENTER_Y = CANVAS_H * 0.58;

// Wider ellipse than before so five front cards have breathing room.
const MOON_RX = 380;
const MOON_RY = 200;

const CARD_WIDTH = 72;
const SCALE_MIN = 0.42;
const OPACITY_MIN = 0.32;

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

  const focusDay = useMemo(() => days.find((d) => d.isToday)?.moonthDay ?? 1, [days]);
  const moonthEndExclusive = useMemo(
    () => instantFromEpochMs(epochMs(days[DAYS_IN_MOONTH - 1]!.at) + 86_400_000),
    [days],
  );

  const eventsByDay = useMemo(
    () => groupEventsByDay(events, days[0]!.at, moonthEndExclusive),
    [events, days, moonthEndExclusive],
  );

  // Previous and next moonths' new moons, for the up/down hints.
  const prevNewMoon = useMemo(() => previousNewMoonBefore(moonthStart), [moonthStart]);
  const nextNewMoon = useMemo(
    () => instantFromEpochMs(epochMs(days[DAYS_IN_MOONTH - 1]!.at) + 86_400_000),
    [days],
  );

  const placedCards = useMemo(() => {
    return days
      .map((d) => {
        const angle = bottomCenteredAngle(d.moonthDay, focusDay);
        const rad = (angle * Math.PI) / 180;
        const x = CENTER_X + MOON_RX * Math.sin(rad);
        const y = CENTER_Y - MOON_RY * Math.cos(rad);
        const t = (1 - Math.cos(((angle - 180) * Math.PI) / 180)) / 2;
        const scale = 1 - (1 - SCALE_MIN) * t;
        const opacity = 1 - (1 - OPACITY_MIN) * t;
        return { day: d, x, y, scale, opacity, depth: t };
      })
      .sort((a, b) => b.depth - a.depth);
  }, [days, focusDay]);

  return (
    <section className="moonth-view">
      <header className="moonth-header">
        <h2>This moonth</h2>
        <p className="moonth-caption">
          28 days from {formatDate(days[0]!.at)} new moon to {formatDate(days[DAYS_IN_MOONTH - 1]!.at)}.
          Today sits at the front; the year runs vertically on the left.
        </p>
      </header>

      <div className="moonth-layout">
        <SolarYearTrack height={CANVAS_H + 84} />

        <div className="moonth-stage">
          <div className="moonth-neighbor moonth-neighbor-prev">
            <span className="moonth-neighbor-arrow">↑</span>
            <span>Previous moonth · new {formatDate(prevNewMoon)}</span>
          </div>

          <div className="moonth-canvas-wrap" style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
            <svg
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="moonth-canvas"
              role="img"
              aria-label="The current moonth"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Faint ellipse showing the wheel's footprint */}
              <ellipse
                cx={CENTER_X}
                cy={CENTER_Y}
                rx={MOON_RX}
                ry={MOON_RY}
                fill="none"
                stroke="#1f232b"
                strokeWidth={0.8}
                strokeDasharray="2 4"
                opacity={0.7}
              />
              {/* "now" tick at the bottom-center, above today's card */}
              <line
                x1={CENTER_X}
                y1={CENTER_Y + MOON_RY + 6}
                x2={CENTER_X}
                y2={CENTER_Y + MOON_RY + 24}
                stroke="#d4a373"
                strokeWidth={1.5}
              />
              <text
                x={CENTER_X}
                y={CENTER_Y + MOON_RY + 38}
                textAnchor="middle"
                fontSize="11"
                fill="#d4a373"
                fontFamily="ui-monospace, monospace"
              >
                today
              </text>
            </svg>

            <div className="moonth-cards">
              {placedCards.map(({ day, x, y, scale, opacity }) => (
                <div
                  key={day.moonthDay}
                  className="moonth-card-slot"
                  style={{
                    left: `calc(${(x / CANVAS_W) * 100}% - ${CARD_WIDTH / 2}px)`,
                    top: `calc(${(y / CANVAS_H) * 100}% - ${Math.round((CARD_WIDTH * 1.55) / 2)}px)`,
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
                    width={CARD_WIDTH}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="moonth-neighbor moonth-neighbor-next">
            <span className="moonth-neighbor-arrow">↓</span>
            <span>Next moonth · new {formatDate(nextNewMoon)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----- helpers ------------------------------------------------------- */

interface DayInfo {
  at: Instant;
  moonAngle: number;
  moonthDay: number;
  isToday: boolean;
}

function bottomCenteredAngle(d: number, focus: number): number {
  let rel = d - focus;
  while (rel > 14) rel -= DAYS_IN_MOONTH;
  while (rel <= -14) rel += DAYS_IN_MOONTH;
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

function previousNewMoonBefore(currentMoonthStart: Instant): Instant {
  // Step back ~30 days and find the new moon there.
  const stepBack = instantFromEpochMs(epochMs(currentMoonthStart) - 30 * 86_400_000);
  const candidate = lunarWheel.nextCrossing(0, stepBack);
  if (candidate === null) return stepBack;
  return candidate;
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
