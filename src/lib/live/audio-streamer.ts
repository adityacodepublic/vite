import {
  createWorketFromSrc,
  registeredWorklets,
} from "./audioworklet-registry";

export class AudioStreamer {
  private sampleRate = 24000;
  private nextStartTime = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];

  public onComplete = () => {};

  constructor(public context: AudioContext) {}

  async addWorklet<T extends (d: any) => void>(
    workletName: string,
    workletSrc: string,
    handler: T,
  ): Promise<this> {
    let workletsRecord = registeredWorklets.get(this.context);
    if (workletsRecord && workletsRecord[workletName]) {
      workletsRecord[workletName].handlers.push(handler);
      return Promise.resolve(this);
    }

    if (!workletsRecord) {
      registeredWorklets.set(this.context, {});
      workletsRecord = registeredWorklets.get(this.context)!;
    }

    workletsRecord[workletName] = { handlers: [handler] };
    const src = createWorketFromSrc(workletName, workletSrc);
    await this.context.audioWorklet.addModule(src);
    const worklet = new AudioWorkletNode(this.context, workletName);
    workletsRecord[workletName].node = worklet;
    return this;
  }

  private bytesToFloat32PCM(chunk: Uint8Array): Float32Array {
    const sampleCount = Math.floor(chunk.byteLength / 2);
    const floats = new Float32Array(sampleCount);
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);

    for (let i = 0; i < sampleCount; i += 1) {
      floats[i] = view.getInt16(i * 2, true) / 32768;
    }

    return floats;
  }

  addPCM16(chunk: Uint8Array) {
    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    const float32Data = this.bytesToFloat32PCM(chunk);
    const buffer = this.context.createBuffer(1, float32Data.length, this.sampleRate);
    buffer.getChannelData(0).set(float32Data);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    const worklets = registeredWorklets.get(this.context);
    if (worklets) {
      Object.values(worklets).forEach(({ node, handlers }) => {
        if (!node) {
          return;
        }
        source.connect(node);
        node.port.onmessage = (ev: MessageEvent) => {
          handlers.forEach((handler) => handler.call(node.port, ev));
        };
        node.connect(this.context.destination);
      });
    }

    const now = this.context.currentTime;
    this.nextStartTime = Math.max(now, this.nextStartTime);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduledSources.push(source);
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx > -1) {
        this.scheduledSources.splice(idx, 1);
      }
      if (this.scheduledSources.length === 0) {
        this.onComplete();
      }
    };
  }

  stop() {
    this.scheduledSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // no-op
      }
    });
    this.scheduledSources = [];
    this.nextStartTime = this.context.currentTime;
  }

  interrupt() {
    this.stop();
  }

  async resume() {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.nextStartTime = Math.max(this.nextStartTime, this.context.currentTime);
  }

  complete() {
    this.onComplete();
  }
}
