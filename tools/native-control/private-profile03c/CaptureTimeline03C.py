"""Frozen timestamp admission for a declared capture window; no endpoint APIs."""
import math
POLICY=dict(schema='Private03C-capture-timeline-02',audioGapSeconds=.002,cumulativeAudioOffsetSeconds=.002,videoGapSeconds=.1,maximumVideoFrameDurationSeconds=.1,requireEveryFramePts=True,requireStrictlyIncreasingVideoPts=True,requireVideoCoverageOfDeclaredWindow=True,minimumVideoFrames=2,roundingToleranceSeconds=1e-9)

def validate(audio,video,start,duration,fixture=False):
    reasons=[];eps=POLICY['roundingToleranceSeconds'];max_audio_gap=0.;max_video_gap=0.;max_cumulative_audio=0.
    if not math.isfinite(start) or start<0 or not math.isfinite(duration) or not 2.8<=duration<=30:reasons.append('invalid-declared-window')
    if not audio:reasons.append('no-audio-frames')
    previous_end=None;origin=None;decoded_duration=0.
    for frame in audio:
        t=frame.get('pts');length=frame.get('duration')
        if t is None or length is None or not math.isfinite(t) or not math.isfinite(length) or length<=0:
            reasons.append('missing-or-invalid-audio-timestamp');continue
        if previous_end is not None:max_audio_gap=max(max_audio_gap,abs(t-previous_end))
        if origin is None:origin=t
        max_cumulative_audio=max(max_cumulative_audio,abs(t-(origin+decoded_duration)))
        decoded_duration+=length
        previous_end=t+length
    if max_audio_gap>POLICY['audioGapSeconds']+eps:reasons.append('audio-timestamp-discontinuity')
    if max_cumulative_audio>POLICY['cumulativeAudioOffsetSeconds']+eps:reasons.append('cumulative-audio-timestamp-discontinuity')
    previous=None
    for frame in video:
        t=frame.get('pts');length=frame.get('duration')
        if t is None or length is None or not math.isfinite(t) or not math.isfinite(length) or length<=0:
            reasons.append('missing-or-invalid-video-timestamp');continue
        if length>POLICY['maximumVideoFrameDurationSeconds']+eps:reasons.append('unbounded-video-frame-duration')
        if previous is not None:
            delta=t-previous
            if delta<=0:reasons.append('non-increasing-video-timestamps')
            max_video_gap=max(max_video_gap,delta)
        previous=t
    if max_video_gap>POLICY['videoGapSeconds']+eps:reasons.append('video-timestamp-discontinuity')
    if not fixture:
        if len(video)<POLICY['minimumVideoFrames']:reasons.append('insufficient-video-frames')
        if audio and video and all(x.get('pts') is not None and x.get('duration') is not None for x in [audio[0],video[0],video[-1]]):
            first=audio[0]['pts']+start;last=first+duration
            if video[0]['pts']>first+eps or video[-1]['pts']+video[-1]['duration']<last-eps:reasons.append('video-does-not-cover-declared-audio-window')
    return dict(passed=not reasons,reasons=sorted(set(reasons)),policy=POLICY,audioFrames=len(audio),videoFrames=len(video),maxAudioTimestampDiscrepancySeconds=max_audio_gap,maxCumulativeAudioTimestampDiscrepancySeconds=max_cumulative_audio,maxVideoFrameIntervalSeconds=max_video_gap,offlineAudioOnlyFixture=fixture)
