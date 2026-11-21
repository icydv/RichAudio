// Independent receiver boundary for the existing neutral C# listener protocol.
// QPC origin remains opaque here. Only the Windows receiver measures QPC age.
const fields = Object.freeze([
  "version",
  "session",
  "generation",
  "sequence",
  "observationTicks",
  "clockFrequency",
  "gameTimeMs",
  "position",
  "velocity",
  "forward",
  "up",
  "listenerKind",
  "velocityKind",
  "paused",
  "valid",
  "reason",
  "coordinates",
  "units",
  "sourceId",
]);
const check = (condition, message) => {
  if (!condition) throw Error(`Listener ${message}`);
};
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;
function vector(value, bound) {
  check(
    Array.isArray(value) &&
      value.length === 3 &&
      value.every((x) => Number.isFinite(x) && Math.abs(x) <= bound),
    "bounded finite vector",
  );
  return Object.freeze(value.slice());
}
export function validateNeutralEnvelope(message, previousState = null) {
  check(
    object(message) &&
      Object.keys(message).length === 3 &&
      message.type === "listener" &&
      Object.hasOwn(message, "state") &&
      Object.hasOwn(message, "receiptAgeMs"),
    "envelope fields",
  );
  check(
    Number.isFinite(message.receiptAgeMs) &&
      message.receiptAgeMs >= -2 &&
      message.receiptAgeMs <= 250,
    "receipt freshness",
  );
  const s = message.state;
  check(
    object(s) &&
      Object.keys(s).length === fields.length &&
      fields.every((name) => Object.hasOwn(s, name)),
    "required fields",
  );
  check(
    s.version === 1 &&
      typeof s.session === "string" &&
      /^[a-f0-9]{32}$/.test(s.session),
    "version/session",
  );
  check(integer(s.generation, 1) && integer(s.sequence), "generation/sequence");
  check(
    integer(s.observationTicks) &&
      integer(s.clockFrequency, 1, 1e10) &&
      integer(s.gameTimeMs, 0, 0xffffffff),
    "clock fields",
  );
  check(
    typeof s.valid === "boolean" && typeof s.paused === "boolean",
    "validity flags",
  );
  check(
    typeof s.reason === "string" &&
      /^[a-z0-9-]{1,80}$/.test(s.reason) &&
      (!s.valid || s.reason === "valid"),
    "status reason",
  );
  check(
    ["camera", "player", "synthetic"].includes(s.listenerKind),
    "listener identity",
  );
  check(
    [
      "estimated-camera-difference",
      "observed-player",
      "authored-synthetic",
      "unavailable",
    ].includes(s.velocityKind),
    "velocity provenance",
  );
  check(
    (s.coordinates === "gta-native-unscaled" &&
      s.units === "native-unverified") ||
      (s.coordinates === "research-rh-z-up-metres-v1" && s.units === "metres"),
    "coordinate scale",
  );
  check(s.sourceId === null, "listener-only source ownership");
  const position = vector(s.position, 1e6),
    velocity = vector(s.velocity, 1000),
    forward = vector(s.forward, 1.00001),
    up = vector(s.up, 1.00001);
  check(
    Math.abs(Math.hypot(...forward) - 1) < 1e-4 &&
      Math.abs(Math.hypot(...up) - 1) < 1e-4 &&
      Math.abs(forward.reduce((sum, x, i) => sum + x * up[i], 0)) < 1e-4,
    "orthonormal orientation",
  );
  if (previousState && previousState.session === s.session) {
    check(
      s.sequence > previousState.sequence &&
        s.observationTicks > previousState.observationTicks,
      "duplicate or reordered observation",
    );
    check(s.generation >= previousState.generation, "generation rollback");
    check(
      s.clockFrequency === previousState.clockFrequency,
      "monotonic clock changed",
    );
    check(
      s.gameTimeMs >= previousState.gameTimeMs ||
        s.generation > previousState.generation,
      "game clock reset without generation",
    );
  }
  return Object.freeze({
    type: "listener",
    receiptAgeMs: Math.max(0, message.receiptAgeMs),
    state: Object.freeze({ ...s, position, velocity, forward, up }),
  });
}
