import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as contracts from '../src/acoustics/engine/contracts.mjs';
import { CausalSimulation } from '../src/acoustics/streaming/causal.mjs';

test('delay iteration samples exactly the full position through motion and generation changes', () => {
  const track = contracts.trajectory([
    {time: 0, position: [0, 0, 0], forward: [1, 0, 0]},
    {time: .25, position: [2, 1, 0], forward: [0, 1, 0]},
    {time: .5, position: [100, 2, 0], generation: 2, valid: false},
    {time: .75, position: [105, 5, 1], generation: 2, forward: [0, 0, 1], up: [1, 0, 0]},
    {time: 1, position: [108, 4, 2], generation: 2, forward: [1, 0, 0], up: [0, 1, 0]},
  ]);
  assert.equal(typeof contracts.trackPosition, 'function');
  for (const t of [-.1, 0, .125, .249999, .25, .375, .4499999, .499999, .5, .500001, .625, .75, .85, 1, 1.5]) {
    assert.deepEqual(contracts.trackPosition(track, t), contracts.pose(track, t).position);
  }
  assert.deepEqual(contracts.trackPosition(track, .499999), [2, 1, 0], 'a teleport is never interpolated');
  assert.equal(contracts.pose(track, .5).valid, false, 'final emission pose still rejects the invalid boundary');
});

test('a rotated interval with a degenerate interpolated basis retains the pose error', () => {
  const track = contracts.trajectory([
    {time: 0, position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0]},
    {time: 1, position: [1, 1, 0], forward: [0, 1, 0], up: [1, 0, 0]},
  ]);
  assert.throws(() => contracts.pose(track, .5), /degenerate direction/);
  assert.throws(() => contracts.trackPosition(track, .5), /degenerate direction/);
});

test('raw source history across a missing observation retains antipodal interpolation errors', () => {
  const simulation = new CausalSimulation(null, {allowMissingScene: true});
  const listener = {position: [0, 0, 0]};
  const source = forward => ({id: 'engine', position: [1, 2, 3], forward, up: [0, 0, 1]});
  simulation.observe({session: 'pose-gap', time: 0, listener, sources: [source([1, 0, 0])]});
  simulation.observe({session: 'pose-gap', time: .025, listener, sources: []});
  simulation.observe({session: 'pose-gap', time: .05, listener, sources: [source([-1, 0, 0])]});
  const track = simulation.track('source', 'engine', .05);
  assert.throws(() => contracts.pose(track, .025), /degenerate direction/);
  assert.throws(() => contracts.trackPosition(track, .025), /degenerate direction/);
});
