# ACOUSTIC-WORLD-04.2: my saved NG decoding readiness

My next NG step is blocked. A saved encrypted directory can be decoded without reopening its archive, but I have not supplied an approved private decryption capability or its exact file bindings. Codex researched public source only in this increment. Codex did not read earlier private captures, acquire keys, run a key loader, inspect a game executable or launch a tool against my installation.

## What existing tooling establishes

At CodeWalker commit `485d56bec00262ed7fa472261cce7bbc6202b96e`, [`RpfFile.ReadHeader`](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/RpfFile.cs#L134-L171) decrypts the entry and name blocks separately. [`GetNGKey` and `DecryptNG`](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTACrypto.cs#L90-L130) select a schedule using the archive filename and its whole-file length cast to unsigned 32-bit. The [filename hash](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTAKeys.cs#L1434-L1476) uses a supplied lookup table and preserves the original character case. A ciphertext file's length cannot substitute for the archive length.

The normal public [`LoadFromPath`/`UseMagicData`](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTAKeys.cs#L166-L315) path accesses an executable when no AES input is supplied, then processes an embedded data dependency. Its `gen9` branch selects the Enhanced executable. A supplied AES input avoids that executable branch but still enters the broader embedded-data pipeline. These are source observations, not permission to invoke the loader or evidence that a particular binary will work on my installation. The inspected functions do not expose a separately qualified saved-directory-only command.

My narrow route is an independently supplied direct capability. A provider would need to supply the following privately, with provenance and permission for this use. These are required shapes, not files that Codex has located:

| Input | Exact decoded size |
| --- | ---: |
| One archive-selected expanded key; index declared separately | 272 bytes |
| Alternatively, all 101 expanded keys | 27,472 bytes |
| NG decryption tables | 278,528 bytes |
| Filename hash lookup table | 256 bytes |

The total is 279,056 bytes for one selected key or 306,256 bytes for the complete schedule. The pinned [loader's unpacked shapes](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTAKeys.cs#L299-L314) and the [NG key selection](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTACrypto.cs#L90-L108) explain these dependencies. My first possible decode scope permits only the selected 272-byte key, not all 101 schedules; the larger shape would need new justification and review. An AES value alone is not that direct capability. No AWC key or encryption tables are needed by this proposed metadata-only route.

## Enhanced, provenance and evidence gates

The shared NG tag identifies the algorithm declaration. It does not authenticate private material, select Enhanced provenance or certify resource compatibility. The inspected NG function has no authenticity check. A successful structural parse can reject malformed outputs; plausible names alone cannot prove that the supplied capability is correct.

My smallest next step is metadata-only: after I supply and approve exact paths and hashes, a new candidate could validate one capability/provenance descriptor and optionally the already-captured acquisition/header metadata receipts. It would not read ciphertext or private key/table files, follow their declared paths or invoke a loader. Input availability is currently unknown.

Before any later decode, I need exact supplied paths, sizes and SHA-256 values; their authorized origin and permitted use; the original archive filename/case and length; and the saved header/ciphertext provenance. The proposal must bind a real-input adapter separately: the earlier original-synthetic profile API must not be relabelled as real-key qualification. Even a successful future directory decode would establish bounded metadata only, not member payload integrity, active mounts, building placement or acoustics.

CodeWalker's pinned [source-release notice](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/Readme_Src.txt) limits that release to educational purposes. [`GTACrypto.cs`](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTACrypto.cs#L1-L20) separately carries the Neodymium MIT notice, also present in [Notice.txt](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/Notice.txt). Those notices do not establish rights to obtain or publish game key material or redistribute every CodeWalker dependency. Applicable tool terms, asset permissions and production redistribution remain unresolved qualification work; this is a research finding, not a legal conclusion.

I have not identified an authorized provider. Codex must not search for default key directories, download embedded key assets, scan executables or run extraction to fill that gap. My [blocked proposals](ACOUSTIC_WORLD_042_READ_ONLY_PROPOSALS.md) keep every private input path and hash unset and supply no executable command.
