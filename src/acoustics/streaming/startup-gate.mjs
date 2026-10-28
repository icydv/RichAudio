// Output gating only: history writes, source clock and propagation keep advancing.
export class StartupGate {
  constructor({ deadlineSeconds = 2.5, fadeSeconds = 0.01 } = {}) {
    if (
      !Number.isFinite(deadlineSeconds) ||
      deadlineSeconds <= 0 ||
      deadlineSeconds > 3 ||
      !Number.isFinite(fadeSeconds) ||
      fadeSeconds <= 0 ||
      fadeSeconds > 0.05
    )
      throw Error("Priming budget");
    this.deadlineFrames = Math.ceil(deadlineSeconds * 48000);
    this.fadeFrames = Math.ceil(fadeSeconds * 48000);
    this.reset(0);
  }
  reset(frame) {
    this.start = frame;
    this.readyFrame = null;
    this.status = "priming";
    this.silentFrames = 0;
  }
  apply(left, right, frame, ready) {
    if (this.status === "priming") {
      if (frame - this.start >= this.deadlineFrames)
        this.status = "deadline-expired";
      else if (ready) {
        this.status = "ready";
        this.readyFrame = frame;
      }
    }
    for (let j = 0; j < left.length; j++) {
      const g =
        this.status === "ready"
          ? Math.min(1, (frame + j - this.readyFrame + 1) / this.fadeFrames)
          : 0;
      left[j] *= g;
      right[j] *= g;
      if (g === 0) this.silentFrames++;
    }
  }
}
