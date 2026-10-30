// User-selected exterior balance from the controlled Source05 pressure audition.
// These are relative authored pressure gains, not measured sound pressure levels.
export const stockExteriorPressure = Object.freeze({
  id: 'user-selected-exhaust-10x-v1',
  engine: 1,
  exhaust: 10,
  commonHeadroom: .25,
  acceptance: 'User selected10x after listening to exhaust-pressure comparison',
});

// Apply the common trim once to BOTH roles. The resulting gains(.25,2.5)
// preserve the accepted10:1 change relative to the existing source-state mix.
// Source PCM/history, passive propagation losses and generic renderer defaults
// are untouched. There is no extra hidden10x gain in the source player.
export function stockExteriorPressureGains(sourceIds) {
  if (!Array.isArray(sourceIds) || !sourceIds.length || new Set(sourceIds).size !== sourceIds.length)
    throw Error('distinct stock engine/exhaust source identities required');
  const roles = new Map();
  for (const id of sourceIds) {
    const match = typeof id === 'string' && /^stock:([a-zA-Z0-9_:-]{1,64}):(engine|exhaust)$/.exec(id);
    if (!match) throw Error('explicit stock role required for pressure calibration');
    const [, model, role] = match;
    const present = roles.get(model) ?? new Set(); present.add(role); roles.set(model, present);
  }
  if ([...roles.values()].some(present => present.size !== 2))
    throw Error('paired engine/exhaust required for accepted exterior balance');
  return Object.freeze(Object.fromEntries(sourceIds.map(id => [id,
    stockExteriorPressure.commonHeadroom * stockExteriorPressure[id.endsWith(':exhaust') ? 'exhaust' : 'engine']])));
}
