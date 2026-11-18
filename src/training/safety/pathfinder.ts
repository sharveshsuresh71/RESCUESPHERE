import type { SafetyGrid } from './grid';

/** Extra cost for walking through tight passages and beside trip hazards. Preference only; never makes a blocked cell passable. */
const NARROW_PENALTY = 1.5;
const HAZARD_PENALTY = 3.0;
const PROXIMITY_PENALTY = 1.0;
const PROXIMITY_TARGET = 0.6;

class MinHeap {
  private readonly items: Array<{ f: number; i: number }> = [];

  get size(): number {
    return this.items.length;
  }

  push(f: number, i: number): void {
    const items = this.items;
    items.push({ f, i });
    let k = items.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (items[parent]!.f <= items[k]!.f) break;
      [items[parent], items[k]] = [items[k]!, items[parent]!];
      k = parent;
    }
  }

  pop(): { f: number; i: number } | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < items.length && items[l]!.f < items[m]!.f) m = l;
        if (r < items.length && items[r]!.f < items[m]!.f) m = r;
        if (m === k) break;
        [items[m], items[k]] = [items[k]!, items[m]!];
        k = m;
      }
    }
    return top;
  }
}

const DIRECTIONS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * A* over the walkable cells of a SafetyGrid. Returns the cell indices from start to
 * goal, or null when no walkable route exists. Diagonal steps may not cut through a
 * blocked corner.
 */
export function findCellPath(grid: SafetyGrid, startCol: number, startRow: number, goalCol: number, goalRow: number): number[] | null {
  const { cols, rows, cell, walkable, narrow, hazard, clearance } = grid;
  const start = grid.index(startCol, startRow);
  const goal = grid.index(goalCol, goalRow);
  if (!walkable[start] || !walkable[goal]) return null;

  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const parent = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const heap = new MinHeap();

  const octile = (c: number, r: number) => {
    const dx = Math.abs(c - goalCol), dz = Math.abs(r - goalRow);
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * cell;
  };

  gScore[start] = 0;
  heap.push(octile(startCol, startRow), start);

  while (heap.size > 0) {
    const current = heap.pop()!.i;
    if (closed[current]) continue;
    if (current === goal) {
      const path: number[] = [];
      for (let n = current; n !== -1; n = parent[n]!) path.push(n);
      return path.reverse();
    }
    closed[current] = 1;

    const col = current % cols;
    const row = Math.floor(current / cols);
    for (const [dc, dr] of DIRECTIONS) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const next = grid.index(nc, nr);
      if (!walkable[next] || closed[next]) continue;
      // no corner cutting: both orthogonal neighbours must be walkable for a diagonal step
      if (dc !== 0 && dr !== 0 && (!walkable[grid.index(col + dc, row)] || !walkable[grid.index(col, row + dr)])) continue;

      const stepLength = dc !== 0 && dr !== 0 ? Math.SQRT2 * cell : cell;
      const penalty =
        (narrow[next] ? NARROW_PENALTY : 0) +
        (hazard[next] ? HAZARD_PENALTY : 0) +
        PROXIMITY_PENALTY * Math.max(0, PROXIMITY_TARGET - clearance[next]!);
      const tentative = gScore[current]! + stepLength * (1 + penalty);
      if (tentative < gScore[next]!) {
        gScore[next] = tentative;
        parent[next] = current;
        heap.push(tentative + octile(nc, nr), next);
      }
    }
  }
  return null;
}
