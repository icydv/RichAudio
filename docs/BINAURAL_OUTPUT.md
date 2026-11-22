# Binaural output

The vehicle pipeline accepts a `spatialOutput` option. Use `speakers` for the existing stereo output, `binaural` for the bounded headphone mixer, or `binaural-reference` to render every arrival independently through the full measured filters. The production gameplay class accepts the same option at construction. Use ordinary stereo headphone playback with any downstream virtual surround disabled.

The renderer takes the three-band pressure of a qualified, retarded path and filters it for the direction from which it reaches the listener. Direct sound and each individually rendered reflection use a separate pair of head-related impulse responses. Listener rotation projects world arrivals into the receiving head's current axes. Response changes crossfade over 8 ms. The path engine still owns travel time, spreading, band losses and the single Doppler operation.

The bounded mixer keeps a separate measured response for each direct sound and up to four of the strongest nearby reflections. Reflection selection uses the calibrated path pressure and favours already selected arrivals when two paths have similar strength. The remaining arrivals combine on six directional buses with their original path delays and losses. A quiet late route can share filter work while retaining direction. The reference decodes every route independently and keeps the complete compact measurement window.

The MIT compact archive already removes common measurement setup delay and compensates for the measurement speaker. RichAudio resamples from 44.1 to 48 kHz on initialization. It interpolates neighbouring responses with the onset offset handled separately so raw timing differences remain audible without simple unaligned impulse averaging. The FIRs run without another block of buffered audio. The 80- and 140-tap profiles have 1.65 and 2.90 ms of causal filter support. The separate arrival offsets within those windows vary by ear and direction. The lower limit of the measurement grid is −40° elevation. The dataset represents a generic mannequin head.

## Measured response credit

Bill Gardner and Keith Martin, *HRTF Measurements of a KEMAR Dummy-Head Microphone*, MIT Media Lab Perceptual Computing Technical Report #280, 1994. Copyright 1994 MIT Media Laboratory. The authors allow unrestricted use with attribution in research and commercial applications. [Source archive and usage terms](https://sound.media.mit.edu/resources/KEMAR.html) · [Measurement and compact file format](https://sound.media.mit.edu/resources/KEMAR/hrtfdoc.txt)

`src/acoustics/streaming/kemar-measurements.mjs` carries the original compact stereo sample payload and its measured angles as a generated JavaScript data module. It is packed from the official `compact.zip` SHA-256 `0bcd69f8e8760cf8eacff4a89594ceca7d44fb94f28ecf0bf19970003bbfb3e0`. To reproduce it, extract the archive and run `node tools/Pack-KemarMeasurements.mjs <extracted-directory>`.
