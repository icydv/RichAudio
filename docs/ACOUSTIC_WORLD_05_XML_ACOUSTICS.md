# My original XML acoustic comparison

Codex prepared a matched acoustic comparison using the existing XML admission, resource inventory, cache builder, joined scene worker, `StockVehicleSource` and stock acoustic pipeline. Its geometry is the wholly original cube exported through the pinned public CodeWalker XML writer. Its sound is original analytic PCM supplied to the existing Bati source class. **Neither the building nor the PCM is a genuine GTA asset.** No endpoint or recording was opened.

Both paired cases use identical source PCM, operating controls, listener/source poses and renderer settings. The paired engine/exhaust emitters keep the existing forward offsets **0.35 / -0.75 m**, up offsets **0.65 / 0.3 m**, directivities **0.1 / 0.65**, accepted pressure gains **0.25 / 2.5**, and master gain **0.175**. The comparison uses my existing `authored-detail-loss-v1` presentation and explicit assumed passive wall coefficients. It does not modify default gameplay or create another synthesis/propagation engine.

Each case has an open arm and a building arm at the **same poses**. The open arm removes only the XML building from this controlled original scene; it does not assert that any real street is empty. The source constructor runs before block rendering on the same Node event loop, with no source pre-roll or CPU-isolation claim. Every selected path, contact vertex, delay and material interaction comes from the existing solver. No diffraction or visual echo is invented.

The fresh 144-block comparison retained these results:

| Original scenario | Existing solver result | Steady stereo RMS, open → building |
| --- | --- | --- |
| Source/listener beside the cube | Clear direct paths around **10.03 m / 29.24 ms**, plus selected first reflections at **11.50–12.07 m / 33.54–35.19 ms**. Direct path bands remain unchanged. | **0.000386185 → 0.000428543** |
| Opposite sides of the cube | Two represented wall intersections per emitter. Selected direct contributions transmit with additional assumed low/mid/high attenuation **27.96 / 33.98 / 40.00 dB**. No reflection or diffraction was selected. | **0.000102327 → 0.00000332930** |

The RMS values are normalized software amplitudes, not measured sound pressure. A reflection can interfere constructively or destructively; the comparison does not impose a louder result. Every paired case retains the same dry PCM hash while its stereo PCM changes. The open/building/open continuity control retains one source, its advancing cursor and renderer histories, with **73,728 source and output frames**, zero limiter events and zero added fixed PCM queue frames. The cache and scene workers each started and joined once. Five focused tests passed.

The private JSON result is SHA-256 `94b9cebd540f779ddf324f59fb781ff83a2d5f098c8b2c2462529c31a0392f99`. No WAV files were written for that run. It retains exact original XML/qualification identities, source/listener/emitter poses, selected solver evidence, direct visibility queries, material interactions, matched PCM hashes, levels and continuity diagnostics. This is a functional acoustic comparison, not a processing-deadline benchmark or real-building validation.

```powershell
node --test tests/Test-XmlAcoustics05.mjs
node tools/Compare-XmlBuilding05.mjs --run --out .local/fresh-original-xml05
```

The optional `--write-original-wav` flag explicitly exports four original analytic float WAVs into that fresh private directory, preserving sample values and relative levels. It does not record an endpoint. Filenames begin with `original-analytic-`; there is no normalization or substitution of genuine Bati assets. The CLI uses only the original fixture factory.

The API is `compareXmlBuilding05({blocks, includePcm, store, trustedArtifacts, building, bank, poses})`, returning `{report, pcm}`. Its default is the original fixture. Trusted control code can instead provide `building: {admission, inputs, session}`, an explicit already-loaded in-memory `bank`, and explicit `beside`/`obstructed` source/listener `poses`. The admission must pass the independent review-policy gate. Every source, listener and offset emitter must lie within the admitted tile; there is no origin-zero pose fallback. The east-cube regression places the same original XML building at X=40 and checks the shifted actual solver paths, alongside missing-pose, forged-token and out-of-bounds-emitter rejection.

Generic API results identify controlled supplied-memory inputs without certifying the bank or geometry's origin. They never load a bank or XML file, automatically write WAVs, or enable an endpoint. The original factories are imported only for the original-fixture branch; the generic route does not require the fixture files or read their reference JSON. The identical-source flag is derived from every dry PCM digest, including the continuity control. If externally supplied memory changes between arms, the result retains the mismatch and does not claim that the source remained identical; the seventh test exercises that case. A real export still requires separately approved input access and the independent evidence policy before any genuine-resource comparison can be claimed. The original JSON measurement above remains unchanged; the generic interface was added afterward and is covered by the sixth focused test.
