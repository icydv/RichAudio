# RichAudio contributor and agent guidance

## Write in my voice

RichAudio is my project. In public-facing README content, GitHub pull-request titles and descriptions, release notes, milestone reports, experiment write-ups, and other narrative documentation, write about my work in **first-person singular** (I, I've, my, me).

- Say **"I heard RichAudio in GTA"**, not **"the owner heard RichAudio"**.
- Say **"I approved the test"**, not **"the user authorised the test"**.
- Say **"my listening feedback"**, not **"the operator's subjective feedback"**, when the feedback is mine.
- Describe my driving, test participation, supplied materials and decisions in first person.
- Do not imply that I personally ran a tool, wrote a change or inspected evidence when Codex, CI or another executor actually did so. Say **"the test runner"**, **"Codex"**, **"CI"** or name the specific automated component for its actions.
- Preserve technical meanings of *source owner*, *owned process*, *ownership lease*, *user account*, *operator process* and other code/API terms when they do not refer to me as the project creator.

## Evidence and change control

Preserve experimental results, test outcomes, timestamps, numerical measures and their uncertainties. Do not recast unverified claims as verified. Do not rewrite hash-pinned approval receipts, sealed proposals, raw logs, immutable historical commit snapshots or machine-readable evidence simply to change the narrative voice; any repinning/resealing requires a separate reviewed change. Existing historical snapshots remain valid even after a newer first-person documentation revision.

For README, user-facing docs and PR descriptions, review the text for third-person references to me before publishing. Do not merge or deploy as a side effect of documentation edits.
