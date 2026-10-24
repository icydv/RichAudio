# CodeWalker GUI observation record

24 October 2026, this Codex investigation. Computer Use skill was used through the supported Windows `sky` API. These are observed actions, not hypothetical instructions.

1. Attempted to launch the supplied `CodeWalker RPF Explorer.exe`; the request timed out and the subsequent CodeWalker-only window query returned no target.
2. Started supplied `CodeWalker.exe explorer` with its tool directory as working directory. A targetable **RPF Explorer - CodeWalker by dexyfex** window appeared and its tree listed the actual Enhanced installation root.
3. Set the Explorer address to `x64\audio\audio_rel.rpf`, then activated Go. The view showed a `config` folder containing 18 items.
4. Opened `config` through the list and Return. Observed `game.dat151.rel`, `sounds.dat54.rel`, `curves.dat16.rel`, categories, dynamix, synth and other RELs, plus `packlist_rel.txt`.
5. Opened `game.dat151.rel`. A separate **game.dat151.rel - Audio dat.rel Editor - CodeWalker by dexyfex** window appeared. The captured screenshot and accessibility text showed XML rooted at Dat151 with version 43747033 and a StaticEmitterList, followed by other game metadata.

No Edit mode, Save, Replace, Import, Delete or archive mutation action was invoked. UI Automation exposed a base-file warning pane in the Explorer; that warning is not evidence of a write. The REL XML editor was viewed without typing into its document. Captures are in this conversation's tool results; no screenshot file was exported into the repository.

The GUI supports the file-open/metadata-view claim. Programmatic evidence supplies the vehicle trace, container tables and record counts. Neither is proof of runtime acoustic behavior or game integration.
