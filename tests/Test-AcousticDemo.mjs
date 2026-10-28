import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { generate } from "../tools/Render-Acoustics06.mjs";
import { demo } from "../tools/acoustics-06-scenes.mjs";
import { prepare, render } from "../src/acoustics/engine/renderer.mjs";
import { signal, wav } from "../src/acoustics/engine/signals.mjs";
import { acousticScene } from "../src/acoustics/engine/contracts.mjs";

test("Five original demo packages contain valid non-silent WAVs and reproducible PCM", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "richaudio-original-demo-"),
  );
  try {
    const a = generate(root, ".local/one"),
      b = generate(root, ".local/two");
    assert.equal(a.demos.length, 5);
    for (let i = 0; i < 5; i++) {
      const row = a.demos[i];
      assert.equal(row.sha256, b.demos[i].sha256);
      assert.equal(row.processedMetrics.nonfiniteSamples, 0);
      assert.equal(row.processedMetrics.clippedSamples, 0);
      assert.equal(row.render.limitedFrames, 0);
      if (row.comparison) {
        assert.equal(row.comparison.sha256, b.demos[i].comparison.sha256);
        assert.equal(row.comparison.metrics.nonfiniteSamples, 0);
        assert.equal(row.comparison.metrics.clippedSamples, 0);
        assert.equal(row.comparison.render.limitedFrames, 0);
      }
      assert.ok(row.processedMetrics.rms > 0.0001);
      const bytes = fs.readFileSync(
        path.join(root, ".local/one", row.files.processed),
      );
      assert.equal(bytes.readUInt32LE(24), 48000);
      assert.equal(bytes.readUInt16LE(22), 2);
      assert.equal(bytes.readUInt32LE(40), row.render.frames * 4);
      assert.equal(bytes.length, row.render.frames * 4 + 44);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        row.sha256,
      );
    }
    assert.ok(a.demos[1].paths.length > a.demos[0].paths.length);
    assert.ok(
      a.demos[2].processedMetrics.rms < a.demos[0].processedMetrics.rms * 0.6,
    );
    assert.throws(() => generate(root, ".local/one"), /fresh/);
    assert.throws(() => generate(root, "public-output"), /private/);
  } finally {
    // The exact mkdtemp result is the only recursively removed path; no computed game/repository path.
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith("richaudio-original-demo-"));
    fs.rmSync(root, { recursive: true });
  }
});
test("Output guards reject links without writing through them", () => {
  const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "richaudio-original-demo-"),
    ),
    outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "richaudio-original-link-"),
    );
  try {
    fs.mkdirSync(path.join(root, ".local"));
    fs.symlinkSync(
      outside,
      path.join(root, ".local", "link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(() => generate(root, ".local/link/new"), /linked/);
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    for (const p of [root, outside]) {
      assert.equal(path.dirname(p), os.tmpdir());
      assert.ok(path.basename(p).startsWith("richaudio-original-"));
      fs.rmSync(p, { recursive: true });
    }
  }
});
test("Demo result is determined by geometry, not scene labels", () => {
  const d = demo("open-road"),
    a = render(prepare(d.scene, [d.source], d.listener, { duration: 1 }));
  const rechecked = acousticScene(
      d.scene.tile,
      d.scene.materials,
      d.scene.config,
    ),
    b = render(prepare(rechecked, [d.source], d.listener, { duration: 1 }));
  assert.deepEqual(wav([a.left, a.right]), wav([b.left, b.right]));
});
test("Original signal generation is deterministic and remains within source bounds", () => {
  for (const kind of ["tone", "engine", "burst", "impulse"]) {
    const a = signal(kind, 0.2, { frequency: 4000 });
    assert.deepEqual(a, signal(kind, 0.2, { frequency: 4000 }));
    assert.ok(a.every((x) => Number.isFinite(x) && Math.abs(x) <= 1));
  }
});
