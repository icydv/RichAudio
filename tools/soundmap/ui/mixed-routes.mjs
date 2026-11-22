const $ = id => document.getElementById(id);
const takeLabels = {direct: 'Direct only', single: 'Single reflections', multi: 'Full mix',
  withheld: 'Route withheld', 'two-vehicles': 'Two vehicles', traffic: 'Five-vehicle traffic', clocked: 'Clocked traffic'};
const fixed = (value, places = 2) => Number.isFinite(value) ? value.toFixed(places) : '—';
const vector = (value, places) => value?.map(n => fixed(n, places)).join(', ') ?? '—';

const trafficColors = ['#ffbc80', '#8fd8ff', '#b9e19a', '#deabff', '#ffa9bb'];
export function trafficColor(engine) {
  const slot = /^stock:slot([0-4]):engine$/.exec(engine)?.[1];
  return trafficColors[slot] ?? '#d8e0ed';
}
function tapVoice(frame, tap) {
  return frame.renderedVoices.find(v => (tap.sourceId === v.engine || tap.sourceId === v.exhaust) &&
    (!['traffic','clocked'].includes(frame.take) || tap.generation % 4294967296 === v.renderGeneration));
}
function sourceLabel(frame, tap) {
  const voice = tapVoice(frame, tap);
  return voice ? voice.vehicle + ' · ' + (tap.sourceId === voice.engine ? 'engine' : 'exhaust') : tap.sourceId;
}

function describe(frame) {
  const selected = new Map(frame.paths.filter(ray => ray.status === 'selected').map(ray => [ray.id,ray]));
  return frame.appliedPaths.map(tap => ({tap, ray: selected.get(tap.id), source: sourceLabel(frame, tap)}));
}

export class MixedRoutes {
  constructor() {
    this.select = $('mixed-route');
    this.select.addEventListener('change', () => this.focus(this.select.value));
  }
  enable(active) {
    this.enabled = active;
    this.focus(null);
    $('mixed-routes').hidden = $('higher-key').hidden = !active;
    document.body.classList.toggle('street-replay', Boolean(active));
    this.showContributors(undefined);
  }
  showContributors(block) {
    $('pcm-panel').hidden = block === undefined;
    if (block === undefined) return;
    const voices = block?.voices ?? [];
    $('pcm-count').textContent = block ? voices.length + (block.sampled?' sampled':'') + ' PCM contributor' +
      (voices.length === 1 ? '' : 's') + (block.uncertain?' · partial attribution':'') : 'No PCM witness at this cursor';
    $('pcm-block').textContent = block ? (block.sampled?'First stereo sample in the clocked block · ':
      'Isolated stereo output · block starting at file sample ') + block.sampleFrame.toLocaleString('en') : '';
    $('pcm-voices').replaceChildren(...voices.map(voice => {
      const li = document.createElement('li');
      li.style.borderColor = trafficColor(voice.engine);
      li.textContent = voice.vehicle + ' · g' + voice.generation + (block.sampled?'':' · '+voice.nonzeroFrames+' frames') +
        (voice.releasing ? ' · release' : '');
      li.title = 'Slot ' + voice.engine.split(':')[1] + ' · render generation ' + voice.renderGeneration +
        ' · peak ' + voice.pcmPeak.toPrecision(4) + ' full scale';
      return li;
    }));
  }
  focus(id) {
    this.want = id;
    this.frame = undefined;
    this.fit = Boolean(id);
  }
  refresh(frame) {
    if (!this.enabled || this.frame === frame) return;
    this.frame = frame;
    const routes = frame?.appliedPaths ? describe(frame) : [];
    const groups = new Map();
    for (const route of routes) {
      const {source, tap, ray} = route;
      let group = groups.get(source);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = source;
        groups.set(source, group);
      }
      const faces = ray?.surfaceIds?.map(id => id.split(':').at(-1).slice(0,8)).join(' → ');
      const label = tap.order ? tap.order + ' bounce' + (tap.order === 1 ? '' : 's') : 'Direct';
      group.append(new Option(source + ' · ' + label + (faces ? ' · ' + faces : '') + (ray ? '' : ' · tap only'), tap.id));
    }
    this.select.replaceChildren(...groups.values());
    this.select.disabled = routes.length === 0;
    const focused = this.want ? routes.find(r => r.tap.id === this.want) : routes.find(r => r.ray) ?? routes[0];
    this.ray = focused?.ray;
    if (focused) this.select.value = focused.tap.id;
    else if (this.want) this.select.add(new Option('Selected route absent at this block', '', true, true));
    $('mixed-take').textContent = takeLabels[frame?.take] ?? 'Gap';
    $('mixed-position').textContent = frame ? 'Block start · take sample ' + frame.takeSampleFrame.toLocaleString('en') +
      ' · file sample ' + frame.comparisonSampleFrame.toLocaleString('en') : 'Waiting for the next sampled block.';
    const walls = new Set(routes.flatMap(r => r.ray?.surfaceIds ?? []));
    $('mixed-status').textContent = frame?.mapHeld ? 'Previous observed positions. No ray observation for this audio block.' :
      frame ? routes.length + ' mixer taps · ' + walls.size + ' distinct reflecting faces' : '';
    $('mixed-bounces').replaceChildren();
    $('mixed-values').replaceChildren();
    $('mixed-voice-values').replaceChildren();
    $('mixed-voice').hidden = true;
    if (!focused) return;
    const {ray, tap} = focused;
    if (ray) {
      for (const [i, id] of ray.surfaceIds.entries()) {
        const li = document.createElement('li'), face = document.createElement('code'), xyz = document.createElement('small');
        face.textContent = id;
        xyz.textContent = 'XYZ  ' + vector(ray.points[i], 3) + ' m';
        li.append(face, xyz);
        $('mixed-bounces').append(li);
      }
    }
    function field(label, value, list = 'mixed-values') {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      $(list).append(dt, dd);
    }
    const direct = routes.find(r => r.tap.sourceId === tap.sourceId && r.tap.order === 0);
    field('State', ray ? 'Selected and applied' : 'Mixer tap without selected ray');
    if (ray) {
      field('Path length', fixed(ray.distance, 3) + ' model m');
      if (direct?.ray && ray.order) field('Solver excess over direct', fixed(1000 * (ray.delay - direct.ray.delay), 3) + ' ms');
      field('Arrival direction', vector(ray.arrivalDirection, 3));
    }
    field('Applied delay', fixed(tap.delayMs, 3) + ' ms');
    if (tap.order && direct) field('Applied excess over direct', fixed(tap.delayMs - direct.tap.delayMs, 3) + ' ms');
    field('Applied bands · L / M / H', vector(tap.gainBands, 4));
    field('Applied stereo pan', fixed(tap.pan, 3));
    field('Mixer block end', tap.atFrame.toLocaleString('en') + ' frames');
    const voice = tapVoice(frame, tap);
    if (voice) {
      $('mixed-voice').hidden = false;
      const add = (label, value) => field(label, value, 'mixed-voice-values');
      add('Vehicle', voice.vehicle + ' · ' + voice.context);
      add('Model / generation', '0x' + voice.model.toString(16) + ' / ' + voice.observedGeneration);
      add('Operating point', fixed(voice.operatingPoint, 3));
      if (Number.isFinite(voice.observationAgeMs)) add('Observation age', fixed(voice.observationAgeMs, 2) + ' ms');
      else if (Number.isFinite(voice.maxObservationAgeMs)) add('Maximum age in take', fixed(voice.maxObservationAgeMs, 2) + ' ms');
      add('Donor', voice.donor ?? voice.voice);
      if (voice.bankSHA256) add('Bank SHA-256', voice.bankSHA256);
    }
  }
}
