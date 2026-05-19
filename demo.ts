/**
 * Demo: a walk through the cyclic calendar's primitives.
 *
 * Run with: npm run demo
 *
 * This is not a test. It exists to demonstrate, in working code, that the
 * architecture from the foundation document is real.
 */

import {
  SimpleWheelRegistry,
  resolve,
  solarWheel,
  lunarWheel,
  now,
  toISOString,
  toGregorianUTC,
  solarYearsSinceOrigin,
  fromISOString,
  type PinningRule,
  type Occurrence,
} from "./src/index.js";

const registry = new SimpleWheelRegistry([solarWheel, lunarWheel]);
const from = now();

function show(label: string, rule: PinningRule) {
  const r = resolve(rule, { registry, from });
  if (r === null) {
    console.log(`  ${label}: (no occurrence found)`);
    return;
  }
  const g = toGregorianUTC(r.at);
  const display =
    `${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")} ` +
    `${String(g.hour).padStart(2, "0")}:${String(g.minute).padStart(2, "0")} UTC`;
  console.log(`  ${label}: ${display}`);
}

console.log("\n=== The wheels, right now ===\n");
console.log(`  Reference instant: ${toISOString(from)}`);
console.log(
  `  Solar wheel position: ${solarWheel.positionAt(from).toFixed(2)}°`,
);
console.log(
  `  Lunar wheel position: ${lunarWheel.positionAt(from).toFixed(2)}°`,
);

console.log("\n=== The eight solar anchors (next occurrence) ===\n");
for (const a of solarWheel.anchors) {
  show(a.name.padEnd(18), {
    kind: "exact",
    anchor: { wheelId: "solar", anchorId: a.id },
  });
}

console.log("\n=== The four lunar anchors (next occurrence) ===\n");
for (const a of lunarWheel.anchors) {
  show(a.name.padEnd(18), {
    kind: "exact",
    anchor: { wheelId: "lunar", anchorId: a.id },
  });
}

console.log("\n=== Composed patterns from the research doc ===\n");

show("Hindu new year (first new moon after spring equinox)", {
  kind: "firstAfter",
  target: { wheelId: "lunar", anchorId: "new_moon" },
  after: {
    kind: "anchor",
    ref: { wheelId: "solar", anchorId: "spring_equinox" },
  },
});

show("Harvest moon (full moon nearest autumn equinox)", {
  kind: "nearest",
  target: { wheelId: "lunar", anchorId: "full_moon" },
  near: {
    kind: "anchor",
    ref: { wheelId: "solar", anchorId: "autumn_equinox" },
  },
  toleranceDays: 30,
});

// Easter-like pattern, sans Sunday: full moon after the first new moon
// after the spring equinox. (Real Easter adds "first Sunday after that",
// which needs a week wheel — out of scope for v1 but a one-file addition.)
const paschalNewMoon: PinningRule = {
  kind: "firstAfter",
  target: { wheelId: "lunar", anchorId: "new_moon" },
  after: {
    kind: "anchor",
    ref: { wheelId: "solar", anchorId: "spring_equinox" },
  },
};
show("Paschal full moon (composition of two rules)", {
  kind: "firstAfter",
  target: { wheelId: "lunar", anchorId: "full_moon" },
  after: { kind: "rule", rule: paschalNewMoon },
});

show("Conjunction: full moon within 7 days of winter solstice", {
  kind: "conjunction",
  primary: { wheelId: "solar", anchorId: "winter_solstice" },
  others: [{ wheelId: "lunar", anchorId: "full_moon" }],
  toleranceDays: 7,
});

show("Within-range: a full moon during the dark half (Samhain → Beltane)", {
  kind: "withinRange",
  target: { wheelId: "lunar", anchorId: "full_moon" },
  start: { wheelId: "solar", anchorId: "samhain" },
  end: { wheelId: "solar", anchorId: "beltane" },
});

console.log("\n=== Counts from arbitrary origins (no origin is privileged) ===\n");

const originA: Occurrence = {
  eventId: "user_began_project",
  at: fromISOString("2024-11-01T00:00:00Z"), // last Samhain
};
const originB: Occurrence = {
  eventId: "gregorian_civil",
  at: fromISOString("0001-01-01T00:00:00Z"),
};
const originC: Occurrence = {
  eventId: "last_winter_solstice",
  at: fromISOString("2025-12-21T00:00:00Z"),
};

console.log(
  `  Solar circuits since 2024-11-01 (project start): ${solarYearsSinceOrigin(originA, solarWheel, from)}`,
);
console.log(
  `  Solar circuits since 0001-01-01 (Gregorian origin): ${solarYearsSinceOrigin(originB, solarWheel, from)}`,
);
console.log(
  `  Solar circuits since last winter solstice: ${solarYearsSinceOrigin(originC, solarWheel, from)}`,
);
console.log(
  `\n  The "Gregorian year" is just one count among these. None is privileged.`,
);

console.log("");
