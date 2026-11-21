import {
  BROWSER_LIVE_FRAME_WINDOW,
  BROWSER_LIVE_FRAME_WINDOW_BYTES,
  type BrowserLiveEvent,
  type BrowserLiveFrame,
  type BrowserLiveWindow,
} from "@houston/wire-types";

export const VIEWER_WINDOW: BrowserLiveWindow = {
  frames: BROWSER_LIVE_FRAME_WINDOW,
  bytes: BROWSER_LIVE_FRAME_WINDOW_BYTES,
};

export class ViewerWindow {
  private unacked: { seq: number; bytes: number }[] = [];
  private held: BrowserLiveFrame | null = null;

  constructor(
    private readonly write: (event: BrowserLiveEvent) => boolean,
    private readonly window: BrowserLiveWindow = VIEWER_WINDOW,
  ) {}

  event(event: BrowserLiveEvent): void {
    this.write(event);
  }

  frame(frame: BrowserLiveFrame): void {
    if (this.fits(frame)) this.send(frame);
    else this.held = frame;
  }

  replay(frame: BrowserLiveFrame): void {
    this.write(frame);
  }

  ack(seq: number): void {
    this.unacked = this.unacked.filter((sent) => sent.seq > seq);
    const held = this.held;
    if (held && this.fits(held)) {
      this.held = null;
      this.send(held);
    }
  }

  private fits(frame: BrowserLiveFrame): boolean {
    if (this.unacked.length === 0) return true;
    if (this.unacked.length >= this.window.frames) return false;
    const inFlight = this.unacked.reduce((sum, sent) => sum + sent.bytes, 0);
    return inFlight + frame.jpeg.length <= this.window.bytes;
  }

  private send(frame: BrowserLiveFrame): void {
    if (this.write(frame))
      this.unacked.push({ seq: frame.seq, bytes: frame.jpeg.length });
  }
}
