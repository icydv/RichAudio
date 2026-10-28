import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateNeutralEnvelope } from "../src/acoustics/streaming/listener-control.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
function envelope(sequence = 0, overrides = {}, receiptAgeMs = 0) {
  return {
    type: "listener",
    receiptAgeMs,
    state: {
      version: 1,
      session: "a".repeat(32),
      generation: 1,
      sequence,
      observationTicks: 10000000 + sequence * 500000,
      clockFrequency: 10000000,
      gameTimeMs: sequence * 50,
      position: [5, 0, 1],
      velocity: [0, 0, 0],
      forward: [-1, 0, 0],
      up: [0, 0, 1],
      listenerKind: "synthetic",
      velocityKind: "authored-synthetic",
      paused: false,
      valid: true,
      reason: "valid",
      coordinates: "research-rh-z-up-metres-v1",
      units: "metres",
      sourceId: null,
      ...overrides,
    },
  };
}
class Producer {
  constructor(t, args = []) {
    this.blocks = [];
    this.logs = [];
    this.pending = Buffer.alloc(0);
    this.stderr = "";
    this.failure = null;
    this.closed = false;
    this.exitCode = null;
    this.child = spawn(
      process.execPath,
      ["tools/Run-Acoustics07.mjs", ...args],
      {
        cwd: root,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.child.stdin.on("error", () => {});
    this.child.on("error", (error) => {
      this.failure = error;
    });
    this.child.on("close", (code) => {
      this.closed = true;
      this.exitCode = code;
    });
    this.child.stdout.on("data", (chunk) => {
      try {
        assert.ok(
          this.pending.length + chunk.length < 1024 * 1024,
          "bounded stdout parse buffer",
        );
        this.pending = Buffer.concat([this.pending, chunk]);
        while (this.pending.length >= 16) {
          const b = this.pending;
          assert.equal(b.toString("ascii", 0, 4), "RA07", "binary stdout only");
          assert.equal(
            b.readUInt32LE(4),
            this.blocks.length,
            "strict output sequence",
          );
          assert.equal(b.readUInt32LE(8), 512, "declared fixed block");
          assert.equal(b.readUInt32LE(12), 0, "reserved flags");
          if (b.length < 4112) break;
          const left = new Float32Array(512),
            right = new Float32Array(512);
          for (let i = 0; i < 512; i++) {
            left[i] = b.readFloatLE(16 + i * 8);
            right[i] = b.readFloatLE(20 + i * 8);
            assert.ok(
              Number.isFinite(left[i]) && Number.isFinite(right[i]),
              "finite PCM",
            );
            assert.ok(
              Math.max(Math.abs(left[i]), Math.abs(right[i])) <= 0.9800001,
              "bounded PCM headroom",
            );
          }
          this.blocks.push({ left, right });
          assert.ok(this.blocks.length <= 512, "test capture bound");
          this.pending = b.subarray(4112);
        }
      } catch (error) {
        this.failure = error;
        this.child.kill();
      }
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
      try {
        assert.ok(this.stderr.length < 65536, "bounded stderr");
        let end;
        while ((end = this.stderr.indexOf("\n")) >= 0) {
          const line = this.stderr.slice(0, end);
          this.stderr = this.stderr.slice(end + 1);
          if (line.trim()) this.logs.push(JSON.parse(line));
        }
      } catch (error) {
        this.failure = error;
        this.child.kill();
      }
    });
    t.after(async () => {
      if (!this.closed) {
        this.child.stdin.end();
        await sleep(50);
      }
      if (!this.closed) this.child.kill();
    });
  }
  send(value) {
    this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  control(command) {
    this.send({ type: "control", command });
  }
  async wait(condition, label, timeout = 8000) {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeout) {
      if (this.failure) throw this.failure;
      if (this.closed) break;
      await sleep(5);
    }
    if (this.failure) throw this.failure;
    assert.ok(
      condition(),
      `${label}; exit=${this.exitCode}; logs=${JSON.stringify(this.logs)}`,
    );
  }
  async grant(count = 4) {
    const wanted = this.blocks.length + count;
    this.send({ type: "credit", blocks: count });
    await this.wait(
      () => this.blocks.length === wanted,
      "granted PCM block count",
    );
  }
  async finish(expected = 0) {
    this.control("stop");
    await this.wait(() => this.closed, "bounded producer shutdown");
    assert.equal(this.exitCode, expected);
    assert.equal(this.pending.length, 0, "no truncated PCM on shutdown");
    const final = this.logs.findLast((item) => item.type === "final");
    assert.ok(final, "final diagnostics exist");
    assert.equal(final.statistics.blocks, this.blocks.length);
    assert.equal(final.frames, this.blocks.length * 512);
    return final;
  }
}
function energy(blocks, channel) {
  let sum = 0,
    samples = 0;
  for (const block of blocks)
    for (const x of block[channel]) {
      sum += x * x;
      samples++;
    }
  return samples ? sum / samples : 0;
}
function totalEnergy(blocks) {
  return energy(blocks, "left") + energy(blocks, "right");
}

test("Neutral envelope owns immutable copied data and preserves explicit units", () => {
  const original = envelope(),
    accepted = validateNeutralEnvelope(original);
  original.state.position[0] = 123;
  assert.equal(accepted.state.position[0], 5);
  assert.ok(Object.isFrozen(accepted.state.position));
  assert.equal(accepted.state.units, "metres");
});
test("Every neutral field is independently required", () => {
  for (const key of Object.keys(envelope().state)) {
    const m = envelope();
    delete m.state[key];
    assert.throws(() => validateNeutralEnvelope(m), key);
  }
});
test("Neutral listener rejects units, vectors, ownership, clocks and unknown fields", () => {
  const invalid = [
    { version: 2 },
    { session: "account-name" },
    { generation: 0 },
    { sequence: -1 },
    { observationTicks: NaN },
    { clockFrequency: 0 },
    { gameTimeMs: -1 },
    { position: [0, Infinity, 0] },
    { velocity: [1001, 0, 0] },
    { forward: [0, 0, 1] },
    { up: [0, 0, 2] },
    { coordinates: "gta-native-unscaled" },
    { sourceId: "native-vehicle" },
    { listenerKind: "unknown" },
    { velocityKind: "guessed" },
    { valid: "true" },
    { reason: "not-valid" },
    { unknown: true },
  ];
  for (const state of invalid)
    assert.throws(() => validateNeutralEnvelope(envelope(0, state)));
  for (const age of [-3, 251, Infinity])
    assert.throws(() => validateNeutralEnvelope(envelope(0, {}, age)));
});
test("Neutral timeline rejects duplicate timestamps, sequence and generation rollback", () => {
  const previous = envelope(10).state;
  for (const state of [
    { sequence: 10 },
    { observationTicks: previous.observationTicks },
    { observationTicks: previous.observationTicks - 1 },
    { gameTimeMs: 0 },
    { clockFrequency: 20000000 },
  ])
    assert.throws(() => validateNeutralEnvelope(envelope(11, state), previous));
  assert.throws(() =>
    validateNeutralEnvelope(envelope(11), { ...previous, generation: 2 }),
  );
  assert.equal(
    validateNeutralEnvelope(
      envelope(11, { gameTimeMs: 0, generation: 2 }),
      previous,
    ).state.generation,
    2,
  );
  assert.equal(
    validateNeutralEnvelope(envelope(0, { session: "b".repeat(32) }), previous)
      .state.sequence,
    0,
  );
});
test("Actual producer emits only credited RA07 stereo Float32 blocks and stops cleanly", async (t) => {
  const p = new Producer(t);
  p.control("start");
  await sleep(180);
  assert.equal(p.blocks.length, 0, "no render output without credit");
  await p.grant(4);
  await sleep(50);
  assert.equal(p.blocks.length, 4, "no credit overrun");
  await p.grant(8);
  const final = await p.finish();
  assert.equal(final.statistics.controlCadenceFrames, 512);
  assert.ok(final.statistics.pathMaximum >= 1);
  assert.ok(totalEnergy(p.blocks.slice(5)) > 1e-8);
  assert.equal(final.dsp.limited, 0);
  assert.equal(final.dsp.pathOverflow, 0);
});
test("Actual source start, emission stop, delayed tail and resume retain the block clock", async (t) => {
  const p = new Producer(t);
  await p.grant(8);
  assert.equal(totalEnergy(p.blocks), 0);
  p.control("start");
  for (let i = 0; i < 4; i++) await p.grant(8);
  const active = totalEnergy(p.blocks.slice(-8));
  assert.ok(active > 1e-8);
  p.control("emit-stop");
  const stopIndex = p.blocks.length;
  await p.grant(4);
  assert.ok(
    totalEnergy(p.blocks.slice(stopIndex)) > 0,
    "already emitted signal remains audible after emission stops",
  );
  for (let i = 0; i < 10; i++) await p.grant(8);
  assert.ok(
    totalEnergy(p.blocks.slice(-8)) < active * 1e-6,
    "bounded tail decays",
  );
  p.control("resume");
  for (let i = 0; i < 4; i++) await p.grant(8);
  assert.ok(totalEnergy(p.blocks.slice(-8)) > active * 0.5);
  await p.finish();
});
test("Incremental native orientation changes stereo PCM without using native positions as metres", async (t) => {
  const p = new Producer(t);
  p.control("start");
  let sequence = 0;
  const update = async (yaw) => {
    p.send(
      envelope(sequence++, {
        coordinates: "gta-native-unscaled",
        units: "native-unverified",
        listenerKind: "camera",
        velocityKind: "unavailable",
        position: [99999, -99999, 88888],
        forward: [-Math.sin(yaw), Math.cos(yaw), 0],
      }),
    );
    await p.grant(4);
  };
  for (let i = 0; i < 10; i++) await update(0);
  const first = p.blocks.slice(-8);
  for (const yaw of [Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4, Math.PI])
    await update(yaw);
  for (let i = 0; i < 10; i++) await update(Math.PI);
  const last = p.blocks.slice(-8),
    final = await p.finish();
  assert.ok(
    energy(first, "left") > energy(first, "right") * 5,
    "source begins on listener left",
  );
  assert.ok(
    energy(last, "right") > energy(last, "left") * 5,
    "orientation rotates same source to listener right",
  );
  assert.equal(
    final.statistics.listenerMode,
    "native-orientation-only-in-synthetic-scene",
  );
  assert.equal(final.statistics.listenerMessages, sequence);
  assert.ok(final.statistics.pathMaximum >= 2);
});
test("Missing incremental telemetry fades safely rather than inventing future movement", async (t) => {
  const p = new Producer(t);
  p.control("start");
  for (let i = 0; i < 8; i++) {
    p.send(envelope(i));
    await p.grant(4);
  }
  const active = totalEnergy(p.blocks.slice(-4));
  assert.ok(active > 1e-8);
  for (let i = 0; i < 10; i++) await p.grant(8);
  const final = await p.finish();
  assert.ok(totalEnergy(p.blocks.slice(-8)) < active * 1e-6);
  assert.ok(final.simulation.staleUpdates > 0);
  assert.equal(final.statistics.listenerMessages, 8);
});
test("An old initial observation cannot become fresh by clamping its audio timestamp", async (t) => {
  const p = new Producer(t);
  p.control("start");
  p.send(envelope(0, {}, 200));
  await p.grant(8);
  await p.grant(8);
  const final = await p.finish();
  assert.equal(
    totalEnergy(p.blocks),
    0,
    "unrepresentable old state must remain silent",
  );
  assert.equal(final.statistics.maxReceiptAgeMs, 200);
});
test("Paused listener and adapter restart produce bounded silence then fresh audio", async (t) => {
  const p = new Producer(t);
  p.control("start");
  for (let i = 0; i < 6; i++) {
    p.send(envelope(i));
    await p.grant(4);
  }
  p.send(envelope(6, { paused: true }));
  for (let i = 0; i < 4; i++) await p.grant(8);
  assert.ok(totalEnergy(p.blocks.slice(-8)) < 1e-12);
  for (let i = 0; i < 8; i++) {
    p.send(envelope(i, { session: "b".repeat(32) }));
    await p.grant(4);
  }
  assert.ok(totalEnergy(p.blocks.slice(-8)) > 1e-8);
  const final = await p.finish();
  assert.ok(final.simulation.resets >= 2);
});
test("Controlled source count uses actual bounded multipath processing", async (t) => {
  const p = new Producer(t, ["--sources", "4", "--scene", "urban-street"]);
  p.control("start");
  for (let i = 0; i < 3; i++) await p.grant(8);
  const final = await p.finish();
  assert.ok(
    final.statistics.pathMaximum >= 4 && final.statistics.pathMaximum <= 48,
  );
  assert.ok(totalEnergy(p.blocks.slice(-8)) > 1e-8);
  assert.equal(final.dsp.pathOverflow, 0);
});
test("Original pulse beacon produces finite propagated PCM through the actual producer", async (t) => {
  const p = new Producer(t, ["--beacon", "pulse"]);
  p.control("start");
  for (let i = 0; i < 4; i++) await p.grant(8);
  const final = await p.finish();
  assert.ok(totalEnergy(p.blocks.slice(-8)) > 1e-8);
  assert.ok(final.statistics.pathMaximum >= 2);
  assert.equal(final.dsp.limited, 0);
});
test("Original diagnostic impulse begins at the analytically delayed sample", async (t) => {
  const p = new Producer(t, ["--beacon", "impulse"]);
  p.control("start");
  for (let i = 0; i < 8; i++) await p.grant(8);
  const final = await p.finish();
  let first = -1;
  for (let b = 0; b < p.blocks.length && first < 0; b++)
    for (let i = 0; i < 512; i++)
      if (
        Math.abs(p.blocks[b].left[i]) + Math.abs(p.blocks[b].right[i]) >
        1e-12
      ) {
        first = b * 512 + i;
        break;
      }
  const arrival = 24000 + (10 / 343) * 48000;
  assert.ok(
    Math.abs(first - arrival) <= 1,
    `first impulse frame ${first}, analytical arrival ${arrival}`,
  );
  assert.ok(totalEnergy(p.blocks) > 0);
  assert.equal(final.dsp.limited, 0);
});
test("Unknown beacon selection fails before producing PCM or opening a worker", async (t) => {
  const child = spawn(
    process.execPath,
    ["tools/Run-Acoustics07.mjs", "--beacon", "unowned-game-source"],
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });
  let bytes = 0,
    diagnostic = "";
  child.stdout.on("data", (b) => {
    bytes += b.length;
  });
  child.stderr.on("data", (b) => {
    diagnostic += b;
  });
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(Error("Invalid selection shutdown timeout"));
    }, 4000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
  assert.equal(code, 1);
  assert.equal(bytes, 0);
  assert.match(diagnostic, /beacon budget/);
});
for (const [label, message] of [
  ["negative credit", { type: "credit", blocks: -1 }],
  ["fractional credit", { type: "credit", blocks: 1.5 }],
  ["excessive credit", { type: "credit", blocks: 9 }],
  ["unknown command", { type: "control", command: "play-gta" }],
  ["invalid listener ownership", envelope(0, { sourceId: "other-source" })],
  ["stale listener envelope", envelope(0, {}, 251)],
])
  test(`Actual producer fails closed for ${label}`, async (t) => {
    const p = new Producer(t);
    p.send(message);
    await p.wait(() => p.closed, "invalid input shutdown");
    assert.equal(p.exitCode, 1);
    assert.equal(p.blocks.length, 0);
    assert.ok(p.logs.some((item) => item.type === "final" && item.error));
  });
for (const [label, raw] of [
  ["malformed JSON", "{broken}\n"],
  ["oversized unterminated control", "x".repeat(16385)],
])
  test(`Actual producer fails closed for ${label}`, async (t) => {
    const p = new Producer(t);
    p.child.stdin.write(raw);
    await p.wait(() => p.closed, "malformed input shutdown");
    assert.equal(p.exitCode, 1);
    assert.equal(p.blocks.length, 0);
  });
test("Actual producer rejects duplicate observation timestamps with increasing sequence", async (t) => {
  const p = new Producer(t);
  p.send(envelope());
  p.send(envelope(1, { observationTicks: 10000000 }));
  await p.wait(() => p.closed, "duplicate timestamp shutdown");
  assert.equal(p.exitCode, 1);
  assert.equal(p.blocks.length, 0);
});
test("Credit accounting includes the block already being prepared", async (t) => {
  const p = new Producer(t);
  p.child.stdin.write(
    '{"type":"credit","blocks":8}\n{"type":"credit","blocks":1}\n',
  );
  await p.wait(() => p.closed, "outstanding credit budget shutdown");
  assert.equal(p.exitCode, 1);
  assert.ok(p.blocks.length <= 8);
  assert.ok(p.logs.some((item) => item.type === "final" && item.error));
});
test("Actual producer closes cleanly when its owning host closes stdin", async (t) => {
  const p = new Producer(t);
  p.control("start");
  await p.grant(4);
  p.child.stdin.end();
  await p.wait(() => p.closed, "host disconnect shutdown");
  assert.equal(p.exitCode, 0);
  assert.equal(p.pending.length, 0);
});
