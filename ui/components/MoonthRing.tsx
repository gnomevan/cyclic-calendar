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
import { DayCard, type DayCardVariant, type DayEventOccurrence } from "./DayCard.js";
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
export const RING_RX = 475;
export const RING_RY = 65;
// Card width chosen so cards just touch at the front of the wheel.
// Chord spacing between adjacent cards at angle 180° = RX · sin(360°/28) ≈ 105.5.
export const CARD_WIDTH = 105;
// Golden ratio (taller than wide).
export const CARD_HEIGHT = 170;
const SCALE_MIN = 0.42;
const OPACITY_MIN = 0.32;

export interface MoonthRingProps {
  /** Instant at the start of this moonth (the new moon). */
  moonthStart: Instant;
  /** Moonth's offset from today's moonth. 0 = current. Negative = past. */
  moonthOffset: number;
  /**
   * Animated day-of-moonth used for card *positions* on the wheel.
   * May be fractional during a rotation animation.
   */
  focusDay: number;
  /**
   * Target day-of-moonth that the user clicked. Used for the focus
   * indicator (border) only — snaps immediately on click while
   * `focusDay` interpolates over the rotation duration. The focus
   * ring appears on the clicked card at t=0; cards then rotate to
   * bring it to the bottom.
   */
  targetDay: number;
  /**
   * If this ring contains today, the day-of-moonth that today is.
   * null otherwise. Used so the "today" glow can travel between rings
   * (or disappear) as the user navigates the stack.
   */
  todayMoonthDay: number | null;
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
  moonthOffset,
  focusDay,
  targetDay,
  todayMoonthDay,
  variant,
  events,
  width,
  height,
}: MoonthRingProps) {
  const centerX = width / 2;
  const centerY = height / 2;

  const days = useMemo<DayInfo[]>(() => {
    // Day N's card represents the 24-hour window starting at the new
    // moon plus (N−1)*24h. The card's `at` is the midpoint of that
    // window — moonthStart + (N − 0.5) days. Counting from the new
    // moon instant (not from UTC midnight) keeps day numbers in
    // lockstep with the lunar cycle: the same lunar angle always
    // falls on the same day-of-moonth across cycles.
    const startMs = epochMs(moonthStart);
    return Array.from({ length: DAYS_IN_MOONTH }, (_, i) => {
      const at = instantFromEpochMs(startMs + (i + 0.5) * 86_400_000);
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
          // isFocus tracks the *target* day, not the animated one, so
          // the focus border snaps to the clicked card immediately
          // even while the rotation is still in flight.
          const isFocus = variant === "focus" && day.moonthDay === targetDay;
          const isToday =
            todayMoonthDay !== null && day.moonthDay === todayMoonthDay;
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
                moonthOffset={moonthOffset}
                moonAngle={day.moonAngle}
                at={day.at}
                isFocus={isFocus}
                isToday={isToday}
                events={eventsByDay.get(day.moonthDay) ?? []}
                width={CARD_WIDTH}
                variant={variant}
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

function groupEventsByDay(
  events: CalendarEvent[],
  moonthStart: Instant,
  _moonthEndExclusive: Instant,
): Map<number, DayEventOccurrence[]> {
  // Bucket boundaries are aligned to the new-moon instant, not UTC
  // midnight. Day N = the 24-hour window [moonthStart + (N−1)·24h,
  // moonthStart + N·24h). This keeps the day-of-moonth numbering in
  // lockstep with the lunar cycle: the same lunar phase angle always
  // lands on the same day-of-moonth across cycles, regardless of what
  // time-of-day the new moon happened.
  const startMs = epochMs(moonthStart);
  const endMs = startMs + DAYS_IN_MOONTH * 86_400_000;
  const result = new Map<number, DayEventOccurrence[]>();

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
        list.push({ event, at: resolved.at });
        result.set(dayNum, list);
      }
      if (ms <= epochMs(cursor)) break;
      cursor = instantFromEpochMs(ms + 1000);
    }
  }
  // Sort each day's occurrences by time.
  for (const occurrences of result.values()) {
    occurrences.sort((a, b) => epochMs(a.at) - epochMs(b.at));
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
