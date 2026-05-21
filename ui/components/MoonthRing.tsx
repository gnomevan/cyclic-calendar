import { useMemo } from "react";
import {
  epochMs,
  instantFromEpochMs,
  lunarWheel,
  resolve,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { DayCard, type DayCardVariant } from "./DayCard.js";
import { wheelRegistry } from "../wheels.js";

/**
 * MoonthRing — one moonth's worth of day cards on a tilted ellipse.
 *
 * Used both for the focused (current) moonth and for the neighboring
 * moonths above and below it in the stacked-torus view. The shape and
 * geometry are identical across all rings; only the variant changes
 * (color, opacity).
 *
 * The focused day (today, for the current moonth; the same day-of-
 * moonth for neighbors) sits at the bottom of the ellipse. Recent
 * days fan left, upcoming days fan right. Cards scale down and fade
 * as they recede into the back of the wheel.
 */

export const DAYS_IN_MOONTH = 28;
export const RING_RX = 420;
export const RING_RY = 65;
export const CARD_WIDTH = 72;
export const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.55);
const SCALE_MIN = 0.42;
const OPACITY_MIN = 0.32;

export interface MoonthRingProps {
  /** Instant at the start of this moonth (the new moon). */
  moonthStart: Instant;
  /** Day-of-moonth (1..28) to place at the bottom-center of the ring. */
  focusDay: number;
  /** Visual variant — drives color treatment. */
  variant: DayCardVariant;
  /** User events to plot on day cards. */
  events: CalendarEvent[];
  /** Width of the ring's container, used for percentage positioning. */
  width: number;
  /** Height of the ring's container. The ellipse center is at height/2. */
  height: number;
}

export function MoonthRing({
  moonthStart,
  focusDay,
  variant,
  events,
  width,
  height,
}: MoonthRingProps) {
  const centerX = width / 2;
  const centerY = height / 2;

  const days = useMemo<DayInfo[]>(() => {
    const startNoonMs = midnightUtc(moonthStart) + 12 * 60 * 60 * 1000;
    return Array.from({ length: DAYS_IN_MOONTH }, (_, i) => {
      const at = instantFromEpochMs(startNoonMs + i * 86_400_000);
      return {
        at,
        moonAngle: lunarWheel.positionAt(at),
        moonthDay: i + 1,
      };
    });
  }, [moonthStart]);

  const moonthEndExclusive = useMemo(
    () => instantFromEpochMs(epochMs(days[DAYS_IN_MOONTH - 1]!.at) + 86_400_000),
    [days],
  );

  const eventsByDay = useMemo(
    () => groupEventsByDay(events, days[0]!.at, moonthEndExclusive),
    [events, days, moonthEndExclusive],
  );

  const placed = useMemo(() => {
    return days
      .map((d) => {
        const angle = bottomCenteredAngle(d.moonthDay, focusDay);
        const rad = (angle * Math.PI) / 180;
        const x = centerX + RING_RX * Math.sin(rad);
        const y = centerY - RING_RY * Math.cos(rad);
        const t = (1 - Math.cos(((angle - 180) * Math.PI) / 180)) / 2;
        const scale = 1 - (1 - SCALE_MIN) * t;
        const opacity = 1 - (1 - OPACITY_MIN) * t;
        return { day: d, x, y, scale, opacity, depth: t };
      })
      .sort((a, b) => b.depth - a.depth);
  }, [days, focusDay, centerX, centerY]);

  // The ring's wireframe color — solid for focus, dimmer for neighbors.
  const wireStroke =
    variant === "focus" ? "#3a2a18" :
    variant === "neighbor-near" ? "#1f232b" :
    "#15181d";
  const wireOpacity = variant === "focus" ? 0.85 : 0.55;

  return (
    <div className={`moonth-ring moonth-ring-${variant}`} style={{ width, height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="moonth-ring-svg" preserveAspectRatio="xMidYMid meet">
        <ellipse
          cx={centerX}
          cy={centerY}
          rx={RING_RX}
          ry={RING_RY}
          fill="none"
          stroke={wireStroke}
          strokeWidth={1}
          strokeDasharray={variant === "focus" ? "0" : "2 4"}
          opacity={wireOpacity}
        />
      </svg>

      <div className="moonth-ring-cards">
        {placed.map(({ day, x, y, scale, opacity }) => {
          const today = variant === "focus" && day.moonthDay === focusDay;
          const cardVariant: DayCardVariant = today ? "focus" : variant;
          return (
            <div
              key={day.moonthDay}
              className="moonth-card-slot"
              style={{
                left: `calc(${(x / width) * 100}% - ${CARD_WIDTH / 2}px)`,
                top: `calc(${(y / height) * 100}% - ${CARD_HEIGHT / 2}px)`,
                transform: `scale(${scale})`,
                opacity,
                zIndex: Math.round(y),
              }}
            >
              <DayCard
                moonthDay={day.moonthDay}
                moonAngle={day.moonAngle}
                at={day.at}
                isToday={today}
                events={eventsByDay.get(day.moonthDay) ?? []}
                width={CARD_WIDTH}
                variant={cardVariant}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----- helpers ------------------------------------------------------- */

interface DayInfo {
  at: Instant;
  moonAngle: number;
  moonthDay: number;
}

function bottomCenteredAngle(d: number, focus: number): number {
  let rel = d - focus;
  while (rel > DAYS_IN_MOONTH / 2) rel -= DAYS_IN_MOONTH;
  while (rel <= -DAYS_IN_MOONTH / 2) rel += DAYS_IN_MOONTH;
  return 180 - rel * (360 / DAYS_IN_MOONTH);
}

function midnightUtc(at: Instant): number {
  const ms = epochMs(at);
  return ms - (ms % 86_400_000);
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

/** Compute the new-moon Instant N moonths offset from the given one. */
export function moonthStartFromOffset(referenceMoonthStart: Instant, offsetMoonths: number): Instant {
  if (offsetMoonths === 0) return referenceMoonthStart;
  // Approximate a synodic month as 29.53 days for stepping, then snap
  // back to the actual new moon via lunarWheel.nextCrossing.
  const synodicMs = 29.53 * 86_400_000;
  const approxMs = epochMs(referenceMoonthStart) + offsetMoonths * synodicMs;
  // Step back ~5 days to ensure we catch the new moon at-or-after our target.
  const searchStart = instantFromEpochMs(approxMs - 5 * 86_400_000);
  const found = lunarWheel.nextCrossing(0, searchStart);
  return found ?? instantFromEpochMs(approxMs);
}

/** Format an Instant as "Mon Day" (e.g., "May 12"). */
export function formatShort(at: Instant): string {
  const g = toGregorianUTC(at);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[g.month - 1]} ${g.day}`;
}
