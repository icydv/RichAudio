// Desired complete vehicle coverage. These declarations are not live capability
// claims, native getters or an instruction to suppress the game's audio.
const freeze = x => { if (x && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); } return x; };
const categories = ['motorcycle', 'car', 'truck', 'bus', 'emergency', 'heavy-machinery', 'aircraft', 'helicopter', 'boat'];
const blocked = ['selective-native-suppression-unverified',
  'native-component-attribution-unverified', 'independent-restoration-and-crash-recovery-unverified'];
const rows = [
 ['engine', 'powertrain', 'continuous', 'Observed running operating state', 'engine-region', 'existing-genuine-bati-additive', 'qualified-running-Bati-normalised-state-only'],
 ['engine-ignition', 'powertrain', 'transient', 'Verified ignition transition', 'engine-region'],
 ['engine-shutdown', 'powertrain', 'transient', 'Observed engine shutdown, never driver-scope loss', 'engine-region'],
 ['exhaust', 'powertrain', 'continuous', 'Observed running operating state and qualified source bank', 'exhaust-outlets', 'existing-genuine-bati-additive', 'qualified-running-Bati-normalised-state-only'],
 ['exhaust-pop', 'powertrain', 'transient', 'Verified combustion/pressure event or explicitly authored source event', 'exhaust-outlets'],
 ['backfire', 'powertrain', 'transient', 'Verified combustion event; acceleration alone is insufficient', 'exhaust-outlets'],
 ['intake', 'powertrain', 'continuous', 'Known intake assembly and supported air-flow/load model', 'intake-region'],
 ['induction', 'powertrain', 'continuous', 'Known induction configuration and qualified operating state', 'intake-region'],
 ['supercharger', 'powertrain', 'continuous', 'Verified supercharger configuration and drive speed', 'supercharger-assembly'],
 ['turbo-spool', 'powertrain', 'continuous', 'Verified turbo configuration and observed/modelled pressure and shaft state', 'turbo-assembly'],
 ['turbo-wastegate', 'powertrain', 'stateful-event', 'Verified pressure regulation event', 'wastegate-outlet'],
 ['turbo-flutter', 'powertrain', 'transient', 'Verified/modelled compressor pressure release or surge; not acceleration alone', 'intake-region'],
 ['transmission', 'powertrain', 'continuous', 'Gear engagement, shaft speed, pinion tooth count and mesh load', 'transmission-assembly', 'original-authored-fixture', 'RPH-current-gear-declaration-only-no-qualified-shaft-or-load'],
 ['clutch', 'powertrain', 'stateful-event', 'Observed engagement/slip with qualified clutch configuration', 'clutch-assembly'],
 ['differential', 'powertrain', 'continuous', 'Verified differential configuration and axle loads', 'differential-assembly'],
 ['engine-braking', 'powertrain', 'continuous', 'Supported driveline load/overrun evidence', 'engine-and-driveline'],
 ['rev-limiter', 'powertrain', 'stateful-event', 'Verified limiter state and actual configured threshold', 'engine-and-exhaust'],
 ['drivetrain-vibration', 'powertrain', 'continuous', 'Qualified shaft speed/load and structural model', 'drivetrain-assembly'],
 ['tyre-rolling', 'road-contact', 'continuous', 'Qualified contact, speed, surface and load', 'individual-wheel-contact', 'original-authored-fixture', 'RPH-last-wheel-contact-point-declaration-only-no-slip-or-load'],
 ['tyre-slip', 'road-contact', 'continuous', 'Validated longitudinal/lateral slip and contact load; speed alone is insufficient', 'individual-wheel-contact', 'original-authored-fixture'],
 ['loose-road', 'road-contact', 'continuous', 'Qualified gravel/dirt/grass/sand contact and motion', 'individual-wheel-contact'],
 ['water-contact', 'road-contact', 'stateful-event', 'Qualified wet-road/puddle contact; weather alone is insufficient', 'individual-wheel-contact'],
 ['surface-transition', 'road-contact', 'transient', 'Verified contact-surface transition', 'individual-wheel-contact'],
 ['tyre-impact', 'road-contact', 'transient', 'Qualified wheel contact/impact event', 'individual-wheel-contact'],
 ['suspension', 'mechanical', 'stateful-event', 'Measured or authored suspension compression/rebound/impact', 'suspension-assembly'],
 ['brake', 'mechanical', 'continuous', 'Rotor sliding speed, pad load, friction and structural mode', 'brake-assembly', 'original-authored-fixture'],
 ['chassis-rattle', 'mechanical', 'continuous', 'Qualified structural excitation and resonant assembly', 'chassis-region'],
 ['mechanical-clunk', 'mechanical', 'transient', 'Verified/authored discrete assembly event', 'declared-assembly', 'original-authored-fixture'],
 ['door', 'mechanical', 'stateful-event', 'Qualified door motion and closing impact', 'specific-door'],
 ['window', 'mechanical', 'stateful-event', 'Qualified window motor/motion event', 'specific-window'],
 ['roof', 'mechanical', 'stateful-event', 'Known roof mechanism and qualified motion', 'roof-mechanism'],
 ['cargo', 'mechanical', 'stateful-event', 'Known movable cargo and contact excitation', 'qualified-cargo-location'],
 ['alarm', 'signalling', 'stateful-event', 'Qualified alarm state', 'alarm-emitter'],
 ['horn', 'signalling', 'continuous', 'Observed horn activation; poll receipt does not locate exact onset', 'horn-mount', 'original-authored-fixture', 'IS_HORN_ACTIVE-declaration-only'],
 ['siren', 'signalling', 'continuous', 'Qualified audible siren state/pattern; light enable alone is insufficient', 'siren-speakers', 'unavailable', 'RPH-siren-state-and-silent-property-declarations-only'],
 ['reverse-warning', 'signalling', 'stateful-event', 'Verified installed warning system and activation', 'warning-emitter'],
 ['vehicle-warning', 'signalling', 'stateful-event', 'Verified vehicle-specific warning equipment and event', 'warning-emitter'],
 ['collision-impact', 'collision', 'transient', 'Qualified contact identity, point, relative motion and severity evidence', 'contact-location', 'original-collision-fixture', 'RPH-last-collision-position-normal-material-declarations-without-time-or-impulse'],
 ['collision-scrape', 'collision', 'continuous', 'Qualified continuing contact and tangential motion', 'contact-location', 'original-collision-fixture'],
 ['collision-resonance', 'collision', 'transient', 'Qualified impact excitation and explicit structural material model', 'affected-structure', 'original-collision-fixture'],
 ['glass-break', 'collision', 'transient', 'Verified/authored glass failure and affected pane', 'specific-window', 'original-collision-fixture'],
 ['debris-impact', 'collision', 'transient', 'Independent bounded secondary contact event', 'debris-contact-location', 'original-collision-fixture'],
 ['material-impact', 'collision', 'transient', 'Qualified metal/plastic/other material contact, unknown remains unknown', 'contact-location'],
 ['aerodynamic-flow', 'aerodynamic', 'continuous', 'Qualified speed, vehicle shape and listener attachment', 'body-and-rider', 'existing-original-bati-additive'],
 ['rotor', 'category-specific', 'continuous', 'Verified rotor configuration and blade/shaft operating state', 'rotor-disc'],
 ['propeller', 'category-specific', 'continuous', 'Verified propeller configuration and operating state', 'propeller-disc'],
 ['jet', 'category-specific', 'continuous', 'Verified jet configuration and exhaust/flow state', 'jet-intake-and-nozzle'],
 ['marine-propulsion', 'category-specific', 'continuous', 'Verified propulsor/cavitation and water-medium assumptions', 'marine-propulsor'],
 ['machinery', 'category-specific', 'stateful-event', 'Known hydraulic/mechanical assembly and qualified state', 'qualified-assembly'],
];

export const vehicleComponentDefinitions = freeze(rows.map(([id, family, timing, cause, region, implementation = 'unavailable', observation = 'unavailable-on-exact-stack']) => ({
 id, family, timing, cause, categories: [...categories], applicability: 'requires-model-specific-configuration-not-assumed-from-category', eventualOwner: 'RichAudio',
 emission: { region, position: 'requires-explicit-qualified-component-pose', defaultOffset: null },
 operatingState: { required: cause, currentObservation: observation, unavailableMustRemainUnavailable: true },
 lifetime: timing === 'continuous' ? 'finite-observation-lease-and-identity' : 'bounded-event-and-identity',
 timestamp: { nativeOccurrence: 'unavailable', pollReceiptIsOccurrence: false },
 intensity: { nativeSoundPower: 'unavailable', modelRequiresExplicitEvidence: true },
 acoustic: { renderer: 'existing-CausalSimulation-StreamingRenderer', directivity: 'explicit-authored-or-qualified-profile',
  physicalPropagationRequired: true, genericReverbPermitted: false },
 replacement: { implementation, productionEnabled: false },
 nativeOverlap: { currentOwner: 'GTA', existence: 'vehicle-profile-and-component-attribution-unverified',
  permitDuplicateDirect: false, embeddedBankContentMustBeAttributed: true },
 ownership: { state: 'NativeOnly', status: 'BLOCKED', suppressionVerified: false, restorationVerified: false,
  blockers: [...blocked, observation==='qualified-running-Bati-normalised-state-only'?'component-separation-and-intensity-unverified':'exact-timely-component-source-not-qualified'] },
})));
const definitions = new Map(vehicleComponentDefinitions.map(d => [d.id, d]));
export const vehicleComponentCategories = freeze([...categories]);
export function getVehicleComponent(id) { const definition = definitions.get(id); if (!definition) throw Error('Unknown vehicle component'); return definition; }
export function componentOwnershipCapabilityMatrix() { return vehicleComponentDefinitions.map(d => freeze({component: d.id,
 currentOwner: 'GTA', eventualOwner: 'RichAudio', replacement: d.replacement.implementation,
 timelySource: d.operatingState.currentObservation, nativeOccurrenceTimestamp: 'unavailable',
 suppression: 'unverified', isolation: 'unverified', restoration: 'unverified', crashRecovery: 'unverified',
 takeover: 'BLOCKED', duplicateDirectPermitted: false})); }

export const componentOwnershipPremises = freeze(['replacementHealthy', 'timelyQualifiedSource', 'selectiveSuppression',
 'noDuplicateAudio', 'unreplacedComponentsPreserved', 'exactIdentityLifecycle', 'independentRestorationAndCrashRecovery']);
export const nativeComponentControlCandidates = freeze([
 {component:'horn',control:'SET_HORN_ENABLED',surface:'published-GTA-native-declaration',
  baselineReadback:'unavailable-IS_HORN_ACTIVE-is-playing-state-not-enabled-state',independentRecovery:'unverified',productionPermitted:false},
 {component:'siren',control:'RPH-Vehicle.IsSirenSilent',surface:'reference-SDK-getter-setter-and-old-official-documentation',
  baselineReadback:'declared-not-exact-runtime-verified',independentRecovery:'unverified',productionPermitted:false},
 {component:'exhaust-pop',control:'ENABLE_VEHICLE_EXHAUST_POPS',surface:'published-GTA-native-declaration-narrow-event-category',
  baselineReadback:'unavailable',independentRecovery:'unverified',productionPermitted:false},
 {component:'engine',control:'FORCE_USE_AUDIO_GAME_OBJECT',surface:'published-vehicle-profile-substitution-declaration-not-component-mute',
  baselineReadback:'unavailable-active-profile-graph',independentRecovery:'unverified',productionPermitted:false},
]);
// A desired registry entry, claimed flags or an original source do not certify
// a native suppression mechanism. No native backend is imported here.
export function evaluateComponentTakeover({component, mode = 'production'} = {}) {
 getVehicleComponent(component);
 return freeze({component, mode, permitted: false, nativeOwner: true, status: 'BLOCKED',
  reasons: mode === 'production' ? [...blocked] : ['no-native-ownership-adapter-in-offline-component-increment'],
  requiredEvidence: [...componentOwnershipPremises]});
}
