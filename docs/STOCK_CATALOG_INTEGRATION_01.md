# Verified stock-bank catalogue seam

`loadStockCatalogAssets` accepts 1–2048 explicitly named, distinct verified banks, without substituting the four demonstration banks. It retains the existing PCM hashes, native format checks, six required engine/exhaust state layers, interval bounds and sustain-atlas bindings. The historical `loadStockAssets` entry point remains restricted to the original four banks. The generic constructor accepts additional identities only when the loader has verified the exact bank object; copying a model label onto an arbitrary object does not register a bank.

Decoded banks require that exact registered object for all model names, including the original four. Renaming a copied bank to a known demonstration name cannot bypass verification. The existing analytical fixture seam is limited to in-memory samples without decoded-file, hash, format or provenance fields; it preserves the original source tests without claiming a decoded/native identity.

This is a reusable loader seam, not installed-source decoding coverage or runtime replacement. Unsupported codecs, incomplete states and unresolved mappings remain explicit failures. No renderer, source clock, operating-state response, pressure share, source texture or native source samples change.

Focused validation: four tests pass, including the opt-in genuine local asset test with `RICHAUDIO_STOCK_SOURCE05_REPORT` pointing to the private published Source05 render report. That test reconstructs the complete 10.3-second emitted source performance and compares its SHA256 to the published waveform for Bati, Lectro, X80 and Schafter. All four hashes remain identical across the native24/32/48kHz assets. Synthetic tests additionally verify distinct arbitrary bank identities, rejection of corrupt/incomplete/duplicate/unsupported manifests, and identical strict/generic four-bank playback.

The installed CodeWalker vehicle metadata catalogue and this verified PCM catalogue are separate readiness stages. Discovering an installed model or granular record does not establish decoded playback, engine/exhaust state semantics, selective native suppression or all-vehicle support.
