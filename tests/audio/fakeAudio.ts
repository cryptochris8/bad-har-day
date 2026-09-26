// Stubbed Web Audio for the audio tests (adapted from ATHLETE MAYHEM's fakeAudio.ts), extended
// into a small GRAPH RECORDER:
//   • every create*() returns a fake node that remembers its kind, its connections, its
//     params' automation (so we know each gain's peak) and its start/stop times;
//   • helpers walk the graph: does a started source reach a target through non-zero gains
//     (structural "non-silence"), do all sources stop (no leaks), how many nodes per second.
// Plus the lifecycle bits: a clock that follows (fake) performance.now(), state changes with
// 'statechange' events, an autoplay-policy switch and a "broken stack" switch.
import { vi } from 'vitest';

export class FakeParam {
  value: number;
  readonly defaultValue: number;
  /** Every value ever scheduled (setValueAtTime / ramps / setTargetAtTime targets). */
  readonly values: number[] = [];
  /** Nodes connected into this param (modulators). */
  readonly inputs: FakeNode[] = [];
  constructor(v = 0) {
    this.value = v;
    this.defaultValue = v;
  }
  private rec(v: number): this {
    this.values.push(v);
    return this;
  }
  setValueAtTime(v: number): this {
    return this.rec(v);
  }
  linearRampToValueAtTime(v: number): this {
    return this.rec(v);
  }
  exponentialRampToValueAtTime(v: number): this {
    return this.rec(v);
  }
  setTargetAtTime(v: number): this {
    return this.rec(v);
  }
  setValueCurveAtTime(): this {
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
  cancelAndHoldAtTime(): this {
    return this;
  }
  /** Largest |value| this param ever takes (initial value or any scheduled one). */
  peak(): number {
    let m = Math.abs(this.value);
    for (const v of this.values) m = Math.max(m, Math.abs(v));
    return m;
  }
}

const PARAMS = ['gain', 'frequency', 'detune', 'Q', 'pan', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release', 'offset', 'delayTime'];

export class FakeNode {
  readonly outputs: Array<FakeNode | FakeParam> = [];
  startAt: number | null = null;
  stopAt: number | null = null;
  buffer: unknown = null;
  loop = false;
  curve: Float32Array | null = null;
  type = '';
  oversample = 'none';
  normalize = true;
  fftSize = 2048;
  [k: string]: unknown;
  constructor(readonly kind: string) {
    for (const p of PARAMS) this[p] = new FakeParam(p === 'gain' ? 1 : 0);
  }
  connect(d: FakeNode | FakeParam): FakeNode | FakeParam {
    this.outputs.push(d);
    if (d instanceof FakeParam) d.inputs.push(this);
    return d;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
  start(when = 0): void {
    this.startAt = when;
  }
  stop(when = 0): void {
    this.stopAt = when;
  }
  setPeriodicWave(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  getFloatTimeDomainData(buf: Float32Array): void {
    buf.fill(0);
  }
  param(name: string): FakeParam {
    return this[name] as FakeParam;
  }
}

/** A fake AudioBuffer; sample memory is only allocated if someone reads it (keeps big test runs lean). */
function fakeBuffer(ch: number, len: number, sr: number): Record<string, unknown> {
  let data: Float32Array[] | null = null;
  return {
    numberOfChannels: ch,
    length: len,
    sampleRate: sr,
    duration: len / sr,
    copyToChannel: () => undefined,
    getChannelData: (c: number) => (data ??= Array.from({ length: ch }, () => new Float32Array(len)))[c],
  };
}

const SOURCE_KINDS = new Set(['Oscillator', 'BufferSource', 'ConstantSource']);

export class FakeAudioContext extends EventTarget {
  static instances: FakeAudioContext[] = [];
  /** Whether resume() is allowed to start the context (autoplay policy). */
  static allowStart = true;
  /** Make node creation throw (a broken audio stack). */
  static explode = false;
  state: string;
  sampleRate = 44100;
  destination = new FakeNode('Destination');
  resumeCalls = 0;
  /** Number of create*() calls (≈ nodes scheduled). */
  nodes = 0;
  /** Every node created, in order. */
  readonly created: FakeNode[] = [];
  frozen = false;
  private t = 0;
  private wall = performance.now();

  constructor() {
    super();
    this.state = FakeAudioContext.allowStart ? 'running' : 'suspended';
    FakeAudioContext.instances.push(this);
    return new Proxy(this, {
      get(target, key, recv) {
        if (typeof key === 'string' && key.startsWith('create') && !(key in target)) {
          return (...args: number[]) => {
            if (FakeAudioContext.explode) throw new Error('boom');
            target.nodes++;
            if (key === 'createBuffer') return fakeBuffer(args[0]!, args[1]!, args[2]!);
            if (key === 'createPeriodicWave') return {};
            const n = new FakeNode(key.slice(6));
            target.created.push(n);
            return n;
          };
        }
        const v = Reflect.get(target, key, recv);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }

  get currentTime(): number {
    const now = performance.now();
    if (this.state === 'running' && !this.frozen) this.t += (now - this.wall) / 1000;
    this.wall = now;
    return this.t;
  }

  setState(s: string): void {
    void this.currentTime;
    this.state = s;
    this.dispatchEvent(new Event('statechange'));
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    if (FakeAudioContext.allowStart && this.state !== 'closed' && this.state !== 'running') this.setState('running');
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    if (this.state === 'running') this.setState('suspended');
    return Promise.resolve();
  }

  close(): Promise<void> {
    if (this.state !== 'closed') this.setState('closed');
    return Promise.resolve();
  }

  /** Started source nodes (oscillators, buffer sources). */
  sources(from = 0): FakeNode[] {
    return this.created.slice(from).filter((n) => SOURCE_KINDS.has(n.kind) && n.startAt !== null);
  }
}

/** Multiplicative gain of a node on the audio path (gains: their peak; everything else: 1). */
function nodeGain(n: FakeNode): number {
  return n.kind === 'Gain' ? (n.gain as FakeParam).peak() : 1;
}

/**
 * Largest product of gain peaks over any node path from `from` to `target` (0 when unreachable).
 * Follows node → node connections only (a modulator feeding a param is not an audio path).
 */
export function pathGain(from: FakeNode, target: FakeNode, maxDepth = 40): number {
  let best = 0;
  const seen = new Set<FakeNode>();
  const walk = (n: FakeNode, g: number, depth: number): void => {
    if (n === target) {
      best = Math.max(best, g);
      return;
    }
    if (depth > maxDepth || seen.has(n)) return;
    seen.add(n);
    for (const o of n.outputs) if (o instanceof FakeNode) walk(o, g * nodeGain(o), depth + 1);
    seen.delete(n);
  };
  walk(from, 1, 0);
  return best;
}

/** The loudest structural path from any started source (created after index `from`) to `target`. */
export function loudestPath(ctx: FakeAudioContext, target: FakeNode, from = 0): number {
  let best = 0;
  for (const s of ctx.sources(from)) best = Math.max(best, pathGain(s, target));
  return best;
}

export class FakeDocument extends EventTarget {
  hidden = false;
}

export interface FakeEnv {
  win: EventTarget;
  doc: FakeDocument;
  activation: { hasBeenActive: boolean; isActive: boolean };
  ctxs: () => FakeAudioContext[];
  last: () => FakeAudioContext;
}

/** Install the fakes (call in beforeEach); pair with uninstallFakeAudio() in afterEach. */
export function installFakeAudio(): FakeEnv {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  FakeAudioContext.instances = [];
  FakeAudioContext.allowStart = true;
  FakeAudioContext.explode = false;
  const activation = { hasBeenActive: false, isActive: false };
  const win = new EventTarget();
  const doc = new FakeDocument();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { userActivation: activation });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const ctxs = (): FakeAudioContext[] => FakeAudioContext.instances;
  return { win, doc, activation, ctxs, last: () => ctxs()[ctxs().length - 1]! };
}

export function uninstallFakeAudio(): void {
  vi.useRealTimers();
  vi.unstubAllGlobals();
}

/** A bare fake context for scheduling recipes / players directly (not tracked in `instances`, so it can be collected). */
export function bareContext(): { ctx: AudioContext; fake: FakeAudioContext } {
  const fake = new FakeAudioContext();
  FakeAudioContext.instances.pop();
  return { ctx: fake as unknown as AudioContext, fake };
}

/** View an AudioNode created by a fake context as its FakeNode. */
export const asFake = (n: AudioNode): FakeNode => n as unknown as FakeNode;
