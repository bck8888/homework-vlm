// Shared nonlinear encoder trained with contrastive loss, without a remote service.
export class Siamese {
  constructor(input = 256, output = 32) {
    this.input = input; this.output = output;
    let seed = 42;
    this.w = Float64Array.from({ length: input * output }, () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return (seed / 4294967296 - .5) * .12;
    });
    this.b = new Float64Array(output);
  }
  encode(x) {
    return Float64Array.from(this.b, (bias, j) => {
      let v = bias;
      for (let i = 0; i < this.input; i++) v += this.w[j * this.input + i] * x[i];
      return Math.tanh(v);
    });
  }
  distance(a, b) { return Math.hypot(...a.map((v, i) => v - b[i])); }
  trainPair(a, b, same, rate = .006) {
    const za = this.encode(a), zb = this.encode(b);
    const d = this.distance(za, zb), margin = 1;
    const loss = same ? d * d : Math.max(0, margin - d) ** 2;
    if (!same && d >= margin) return loss;
    const scale = same ? 2 : -2 * (margin - d) / Math.max(d, 1e-8);
    for (let j = 0; j < this.output; j++) {
      const g = scale * (za[j] - zb[j]);
      const ga = g * (1 - za[j] ** 2), gb = -g * (1 - zb[j] ** 2);
      for (let i = 0; i < this.input; i++) this.w[j * this.input + i] -= rate * (ga * a[i] + gb * b[i]);
      this.b[j] -= rate * (ga + gb);
    }
    return loss;
  }
}

export function pixels(canvas) {
  const small = document.createElement('canvas'); small.width = small.height = 16;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 16, 16);
  const rgba = ctx.getImageData(0, 0, 16, 16).data;
  return Float64Array.from({ length: 256 }, (_, i) => 1 - (rgba[i*4] + rgba[i*4+1] + rgba[i*4+2]) / 765);
}

export async function trainSiamese(classes, prepare, progress) {
  const model = new Siamese();
  const samples = [];
  for (const item of classes) {
    const img = new Image(); img.src = item.asset; await img.decode();
    const variants = [];
    for (let k = 0; k < 12; k++) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,512,512);
      ctx.translate(256,256); ctx.rotate((k % 5 - 2) * .025);
      const size = 250 + (k % 4) * 4;
      ctx.drawImage(img, -size/2, -size/2, size, size);
      variants.push(pixels(prepare(canvas)));
    }
    samples.push({ item, variants });
  }
  // The two acceptable reference designs share the normal class.
  const sameClass = (a,b) => a.item.id === b.item.id || (a.item.group === 'normal' && b.item.group === 'normal');
  const measure = () => {
    let pos = 0, neg = 0, np = 0, nn = 0;
    for (const a of samples) for (const b of samples) {
      const d = model.distance(model.encode(a.variants[0]), model.encode(b.variants[11]));
      if (sameClass(a,b)) { pos += d; np++; } else { neg += d; nn++; }
    }
    return { positive: pos/np, negative: neg/nn };
  };
  const before = measure();
  for (let epoch = 0; epoch < 80; epoch++) {
    let loss = 0;
    for (let i=0;i<samples.length;i++) for (let j=0;j<samples.length;j++) {
      loss += model.trainPair(samples[i].variants[epoch%10], samples[j].variants[(epoch*3+1)%10], sameClass(samples[i], samples[j]));
    }
    progress(epoch+1, loss/64, before);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { model, references: samples.map(s => ({ item:s.item, vector:model.encode(s.variants[0]) })), before, after:measure() };
}
