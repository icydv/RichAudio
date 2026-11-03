# My integrated CodeWalker dependency

I chose to integrate the required CodeWalker.Core functionality into RichAudio. Codex builds the pinned public C# source automatically and packages the worker, dependencies, corresponding adapted source and notices. Users do not need to download or launch CodeWalker separately.

Credit: **CodeWalker by dexyfex**. [Author's download page](https://www.gta5-mods.com/tools/codewalker-gtav-interactive-3d-map) · [Pinned source](https://github.com/dexyfex/CodeWalker/tree/485d56bec00262ed7fa472261cce7bbc6202b96e).

Original source headers, `Notice.txt` and `Readme_Src.txt` are preserved. My project decision to use and redistribute this component is not a claim that Codex verified a blanket upstream licence or written authorisation. The notices retain their original meanings.

The build adapts bounded in-memory archive admission, unavailable implicit-bootstrap errors and WORLD09's explicit bounded memory initializer. It includes no `magic.dat`, `.resx`, game executable, archive, exported game asset or private key material. Protected bootstrap material is unavailable in this package. The memory initializer can consume separately approved opaque/AES inputs through the supervised worker; authored containers exercise it offline. Actual archive/resource readers remain functional for supported inputs; that is not proof of installed Enhanced compatibility.

SharpDX and SharpDX.Mathematics are version 4.2.0 from public NuGet, using the net45 libraries. Their upstream notice is included. CodeWalker's notice also credits Neodymium, Cameron Berry and Hamish Milne's FBX library; the upstream GPL/LGPL texts are retained alongside that notice. No original copyright header is removed.

Pinned notice sources:

- SharpDX: `8e5df9f17b1d328c595a9df5851dbb2537b55621/License.txt`.
- FbxWriter: `a4e33d55c9fe0847dd31628aa22579ea2c3fbf5b/GPL.LICENSE` and `LGPL.LICENSE`.

Build with `pwsh -NoProfile -File tools/Build-CodeWalkerProvider08.ps1 -OutputRoot .local/fresh-provider-build08`. Package with `pwsh -NoProfile -File tools/Package-CodeWalkerProvider08.ps1 -OutputRoot build/fresh-provider-package08`. Packaging is a local build operation and does not install, launch GTA or authorise resource access.
