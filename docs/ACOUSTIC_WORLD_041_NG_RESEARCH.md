# ACOUSTIC-WORLD-04.1: my recognized NG metadata boundary

My approved ACOUSTIC-WORLD-04 header attempt reported `0x0FEFFFFF`. The pinned public source identifies that value as **`RpfEncryption.NG`**. I now classify the declaration as recognized NG. My existing plain-table inventory cannot process it, and genuine NG decryption on my installation remains unqualified. The consumed candidate03 and its original reports remain historical evidence.

The missing private decryption data is the information needed to turn the protected directory bytes into names and offsets. Public algorithm code supplies the procedure, not an authorized private input. I have not identified or supplied that input. Codex will not search for it or extract it from my game to continue this work.

## Pinned primary-source findings

Codex inspected named public text functions at CodeWalker commit `485d56bec00262ed7fa472261cce7bbc6202b96e`; no game executable, installed archive, key file or embedded key-data blob was accessed in this increment.

| Primary source | Relevant functions and finding |
| --- | --- |
| [RpfFile.cs](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/RpfFile.cs#L119-L155) | `ReadHeader` reads 16-byte entries and a separate names block, then applies `DecryptNG` independently to both using the archive name and its whole-file length cast to unsigned 32-bit. The [enum](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/RpfFile.cs#L1954-L1960) explicitly names NG. |
| [GTACrypto.cs](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTACrypto.cs#L82-L224) | `GetNGKey`, `DecryptNG`, `DecryptNGBlock` and round functions define the schedule and block operations. |
| [GTAKeys.cs: hash](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTAKeys.cs#L1338-L1368) | `GTA5Hash.CalculateHash` depends on a supplied 256-byte lookup table and the original characters; it does not lowercase the name. An ordinary filename hash is not an interchangeable dependency. |
| [GTAKeys.cs: loading](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTAKeys.cs#L137-L275) | `LoadFromPath` calls `UseMagicData`. Its explicit Gen9 choice selects the Enhanced executable when no AES key is supplied. A supplied AES value takes the other branch. Derived state comes from the embedded data dependency after masking, AES processing and decompression. This loader is outside my authorized scope. |

The key index is the unsigned 32-bit wrapped sum of the lookup-based filename hash, archive length and 61, reduced modulo 101. A selected expanded key is 272 bytes. Sixteen-byte blocks pass through 17 rounds: A for indices 0 and 1, B for 2 through 15, then A for 16. Each round combines four table lookups and one subkey word per output word; B uses the source's cross-byte grouping. Incomplete trailing bytes are retained by that implementation. Correct block operations alone do not establish correct keys or archive identity. [Source](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTACrypto.cs#L82-L224).

## Enhanced and key availability

The inspected NG round functions have no Gen9 branch. The loader's executable choice is explicit; a common tag cannot select a target's keys or prove Enhanced resource-layout compatibility. My retained header supplied no key material. No valid private NG capability, its exact path, authorized use or content identity has been supplied for this proposal.

For a directly supplied archive-specific decryption capability, the required shapes are one 272-byte expanded key, 278,528 bytes of decryption tables and a 256-byte hash lookup table: **279,056 bytes** total. A full set of 101 expanded keys raises that total to **306,256 bytes**. These sizes describe dependencies, not known key values. The new synthetic profile API accepts either shape and verifies a selected key's index. It does not qualify real key material.

A future direct capability avoids invoking the broad key loader. AES key acquisition, executable scanning, embedded-data downloads, default `Keys` directory searches, AWC keys and encryption-table generation are outside this metadata proposal. No key values, encoded key strings or real table bytes belong in GitHub, logs, exception text or public reports. Exact private capability provenance and permitted use must be established before Codex can read it.

The separately implemented offline tests use wholly original synthetic lookup/table/key material. They can check unsigned arithmetic, round ordering, selected-key binding, bounded metadata and failure behavior. They cannot demonstrate the correctness or availability of a genuine installed-world key capability.

The inspected NG operation supplies no authentication check. Structural validation can reject malformed results and tested wrong profiles, but plausible plaintext alone cannot authenticate a profile or establish Enhanced compatibility. Material hashes bind the selected inputs; their provenance still needs independent qualification.

## Source-use boundary

The pinned [Readme_Src.txt](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/Readme_Src.txt) limits the source release to educational purposes. `GTACrypto.cs` carries a Neodymium MIT notice, also retained in the pinned [Notice.txt](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/Notice.txt). These notices have different scope; a component notice does not establish unrestricted redistribution of the full parser profile or game key material. My work remains a private research/offline implementation. Production redistribution and every dependency's applicable terms remain separate qualification work.

My [read-only proposal](ACOUSTIC_WORLD_041_READ_ONLY_PROPOSAL.md) separates a new exact ciphertext-only capture from later blocked decoding. Capturing opaque bytes needs no decryption data; it supplies no directory names. Recognizing NG supplies a concrete algorithm and dependency contract, with no resource triplet, mount order, placement, activation, MLO support or acoustic proof.
