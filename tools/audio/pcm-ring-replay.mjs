// Actual device-free C# PcmRing fixture; no audio backend or host entry point.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
export function pcmRingGain(sink, output, name, r, gain) {
  const input = Buffer.alloc(r.left.length * 8);
  for (let i = 0; i < r.left.length; i++) { input.writeFloatLE(r.left[i], i * 8); input.writeFloatLE(r.right[i], i * 8 + 4); }
  const source = path.join(output, name + "-input.f32"), dest = path.join(output, name + "-gain.f32");
  fs.writeFileSync(source, input, { flag: "wx" });
  execFileSync(sink, [source, dest, String(gain)], { windowsHide: true, timeout: 10000 });
  const b = fs.readFileSync(dest); assert.equal(b.length, input.length);
  const left = new Float32Array(r.left.length), right = left.slice();
  for (let i = 0; i < left.length; i++) {
    left[i] = b.readFloatLE(i * 8); right[i] = b.readFloatLE(i * 8 + 4);
    assert.equal(left[i], Math.fround(r.left[i] * Math.fround(gain)));
    assert.equal(right[i], Math.fround(r.right[i] * Math.fround(gain)));
  }
  return { left, right };
}
