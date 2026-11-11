// Counts actual center passages; never uses the video's expected sequence.
export class PassageCounter {
  constructor() { this.armed = true; this.records = []; }
  observe(roi, width) {
    const offset = roi.centerX - width / 2;
    if (!roi.detected || Math.abs(offset) > 90) this.armed = true;
    if (!roi.detected || (offset > 0 || offset < -25) || !this.armed) return false;
    this.armed = false;
    return true;
  }
  add(result, videoTime) {
    this.records.push({ videoTime, status: result.status, id: result.best.item.id, label: result.best.item.labelKo, score: result.best.score, inference: result.inference });
  }
  report(classes, complete = false) {
    const counts = classes.map(c => ({ id: c.id, label: c.labelKo, expected: 4, actual: this.records.filter(r => r.id === c.id && r.status !== 'review').length }));
    const review = this.records.filter(r => r.status === 'review').length;
    return { complete, expectedTotal:32, actualTotal:this.records.length, review, counts, countMatch:complete && this.records.length === 32 && review === 0 && counts.every(c => c.actual === c.expected), records:this.records };
  }
}
