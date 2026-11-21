# First live powertrain replacement on a stock Adder

21 November 2026 · GTA V Enhanced 1.0.1158.16 · Story Mode

I drove a stock Adder and heard RichAudio's Bati engine and exhaust respond at idle, under acceleration and on lift-off. When I muted RichAudio, I could still hear GTA's tyres and horn, but the audible engine and exhaust disappeared. The car stayed on the same private `RA_RC_QUIET` profile throughout mute and resume. That let me hear exactly what RichAudio was contributing.

The six Bati layers used the Adder's live, normalised rev ratio. The renderer inferred lift-off from falling revs. The car was still an Adder and the Bati was the development voice. The switch made two GTA audio requests on the same vehicle. It selected the quiet profile once the host had prepared audio, then requested stock `ADDER` after the host withdrew. I heard stock sound return in the earlier private-profile session. In this run I finished without making a final listening check. Independent verification passed after the temporary installation was removed.

## What needs fixing

The voice was much too quiet. At sustained high revs I heard a steady note and couldn't hear a limiter bounce. After resume the sound became choppy and unpleasant. The voice was muted again.

The host counted 1,189,760 stale frames and zero PCM-ring underflow frames over the session. Those totals include time spent muted. The next job is to find where audio spent its 250 ms freshness budget around resume and check whether discarded frames line up with the breakup I heard. Gain and high-rev behaviour are separate follow-ups. This demonstration covers one driven car.

Tested source commit: `ab6632b47ab3580068f4b3cacccc926e7a056bad`.
