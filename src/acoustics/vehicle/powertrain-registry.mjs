const adder = 0xb779a091;
const bati = 0xf9300cc5;
const isAdderPlayer = (model, context) => model === adder && context === 'player';
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function validatePowertrainWorld(config) {
  if (config.powertrainWorld !== undefined && typeof config.powertrainWorld !== 'boolean')
    throw Error('Boolean private powertrain world opt-in required');
  if (config.powertrainVoice === undefined && !config.powertrainWorld) return false;
  const eligible = config.eligible;
  if (config.powertrainVoice !== 'bati-player-on-adder' || config.demoProfile || config.vehicleSourcePolicy ||
      eligible?.length !== 1 || !isAdderPlayer(eligible[0]?.model, eligible[0]?.context))
    throw Error('one stock ADDER player and a dedicated private powertrain package required');
  if (!config.powertrainWorld && config.acousticWorld !== false)
    throw Error('explicit private powertrain world opt-in required');
  if (config.powertrainWorld) {
    const world = config.acousticWorld;
    if (!world || !digest(world.retainedManifestSHA256) || !digest(world.catalogSHA256) ||
        !Array.isArray(world.resourceIds) || world.resourceIds.length === 0 ||
        !['privateCacheRoot','derivedCacheRoot','manifestPath','catalogPath'].every(key =>
          typeof world[key] === 'string' && world[key].length > 0))
      throw Error('private powertrain world requires retained manifest and catalogue bindings');
  }
  return true;
}

export function powertrainRegistry(stockRegistry) {
  const voice = stockRegistry.resolve(bati,'player');
  if (voice?.status !== 'available' || voice.bank.model !== 'bati')
    throw Error('verified six-layer Bati player bank unavailable');
  const adderVoice = {...voice, model:'adder', modelHash:adder};
  return {
    resolve(model, context) {
      return isAdderPlayer(model, context) ? adderVoice : {status:'unavailable',reason:'unbound-private-powertrain-vehicle'};
    },
    createSource(model, context, options) {
      if (!isAdderPlayer(model, context)) throw Error('unbound private powertrain vehicle');
      return stockRegistry.createSource(bati, context, options);
    },
    prepareSource10(model, context) {
      if (!isAdderPlayer(model, context)) throw Error('unbound private powertrain vehicle');
      return stockRegistry.prepareSource10(bati, context);
    },
    preparationDiagnostics10: () => stockRegistry.preparationDiagnostics10(),
  };
}
