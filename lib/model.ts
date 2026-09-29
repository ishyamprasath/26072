export type Mlp = {
  input: number;
  hidden: number;
  output: number;
  w1: Float64Array;
  b1: Float64Array;
  w2: Float64Array;
  b2: Float64Array;
};

export function createMlp(input: number, hidden: number, output: number, seed = 7): Mlp {
  const rand = mulberry32(seed);
  const w1 = new Float64Array(hidden * input);
  const w2 = new Float64Array(output * hidden);
  const scale1 = Math.sqrt(2 / input);
  const scale2 = Math.sqrt(2 / hidden);
  for (let i = 0; i < w1.length; i += 1) w1[i] = (rand() * 2 - 1) * scale1;
  for (let i = 0; i < w2.length; i += 1) w2[i] = (rand() * 2 - 1) * scale2;
  return { input, hidden, output, w1, b1: new Float64Array(hidden), w2, b2: new Float64Array(output) };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sigmoid(value: number): number {
  if (value > 30) return 1;
  if (value < -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

export function forward(model: Mlp, input: Float64Array): { hidden: Float64Array; logits: Float64Array; probs: Float64Array } {
  const hidden = new Float64Array(model.hidden);
  for (let h = 0; h < model.hidden; h += 1) {
    let sum = model.b1[h];
    const row = h * model.input;
    for (let i = 0; i < model.input; i += 1) sum += model.w1[row + i] * input[i];
    hidden[h] = sum > 0 ? sum : 0;
  }
  const logits = new Float64Array(model.output);
  const probs = new Float64Array(model.output);
  for (let o = 0; o < model.output; o += 1) {
    let sum = model.b2[o];
    const row = o * model.hidden;
    for (let h = 0; h < model.hidden; h += 1) sum += model.w2[row + h] * hidden[h];
    logits[o] = sum;
    probs[o] = sigmoid(sum);
  }
  return { hidden, logits, probs };
}

export type Sample = { x: Float64Array; y: number[] };

/** One hidden layer, weighted binary cross-entropy, SGD with momentum. */
export function trainMlp(model: Mlp, samples: Sample[], epochs: number, learningRate: number, seed = 11): number[] {
  const velocity1 = new Float64Array(model.w1.length);
  const velocityB1 = new Float64Array(model.b1.length);
  const velocity2 = new Float64Array(model.w2.length);
  const velocityB2 = new Float64Array(model.b2.length);
  const rand = mulberry32(seed);
  const losses: number[] = [];
  const alpha = 0.75;
  const momentum = 0.9;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let loss = 0;
    for (let n = samples.length - 1; n > 0; n -= 1) {
      const swap = Math.floor(rand() * (n + 1));
      const tmp = samples[n];
      samples[n] = samples[swap];
      samples[swap] = tmp;
    }
    for (const sample of samples) {
      const { hidden, logits } = forward(model, sample.x);
      const gradHidden = new Float64Array(model.hidden);
      for (let o = 0; o < model.output; o += 1) {
        const probability = sigmoid(logits[o]);
        const target = sample.y[o];
        const weight = target ? alpha : 1 - alpha;
        const dLogit = weight * (probability - target);
        const pt = target ? probability : 1 - probability;
        loss += -(weight * Math.log(Math.min(1 - 1e-8, Math.max(1e-8, pt))));
        const row = o * model.hidden;
        for (let h = 0; h < model.hidden; h += 1) {
          if (hidden[h] > 0) gradHidden[h] += dLogit * model.w2[row + h];
        }
        for (let h = 0; h < model.hidden; h += 1) {
          const gradient = dLogit * hidden[h];
          velocity2[row + h] = momentum * velocity2[row + h] + gradient;
          model.w2[row + h] -= learningRate * velocity2[row + h];
        }
        velocityB2[o] = momentum * velocityB2[o] + dLogit;
        model.b2[o] -= learningRate * velocityB2[o];
      }
      for (let h = 0; h < model.hidden; h += 1) {
        const row = h * model.input;
        for (let i = 0; i < model.input; i += 1) {
          const gradient = gradHidden[h] * sample.x[i];
          velocity1[row + i] = momentum * velocity1[row + i] + gradient;
          model.w1[row + i] -= learningRate * velocity1[row + i];
        }
        velocityB1[h] = momentum * velocityB1[h] + gradHidden[h];
        model.b1[h] -= learningRate * velocityB1[h];
      }
    }
    losses.push(loss / Math.max(1, samples.length));
  }
  return losses;
}

export function serializeMlp(model: Mlp): string {
  return JSON.stringify({
    input: model.input,
    hidden: model.hidden,
    output: model.output,
    w1: Array.from(model.w1),
    b1: Array.from(model.b1),
    w2: Array.from(model.w2),
    b2: Array.from(model.b2),
  });
}

export function deserializeMlp(text: string): Mlp {
  const raw = JSON.parse(text) as Mlp;
  return {
    input: raw.input,
    hidden: raw.hidden,
    output: raw.output,
    w1: Float64Array.from(raw.w1),
    b1: Float64Array.from(raw.b1),
    w2: Float64Array.from(raw.w2),
    b2: Float64Array.from(raw.b2),
  };
}
