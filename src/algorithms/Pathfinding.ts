import type { ObstacleMarker, RoomObject, Vec2 } from '../core/types';

export interface PathResult { points: Vec2[]; distanceMeters: number; blocked: boolean; exploredNodes: number }
interface Node { x: number; z: number; g: number; f: number; parent?: Node }

/** Grid-based A* planner. Marked obstacles and furniture are treated as clearance zones. */
export function findPath(
  start: Vec2, goal: Vec2, width: number, length: number,
  obstacles: ObstacleMarker[], objects: RoomObject[], cell = 0.1
): PathResult | null {
  const cols = Math.max(2, Math.ceil(width / cell));
  const rows = Math.max(2, Math.ceil(length / cell));
  const toCell = (p: Vec2) => ({ x: Math.max(0, Math.min(cols - 1, Math.round((p.x + width / 2) / cell))), z: Math.max(0, Math.min(rows - 1, Math.round((p.z + length / 2) / cell))) });
  const toWorld = (x: number, z: number): Vec2 => ({ x: Number((x * cell - width / 2).toFixed(2)), z: Number((z * cell - length / 2).toFixed(2)) });
  const s = toCell(start), g = toCell(goal);
  const blocked = new Set<string>();
  const mark = (p: Vec2, rx: number, rz: number) => {
    const c = toCell(p), nx = Math.ceil(rx / cell), nz = Math.ceil(rz / cell);
    for (let z = Math.max(0, c.z - nz); z <= Math.min(rows - 1, c.z + nz); z++)
      for (let x = Math.max(0, c.x - nx); x <= Math.min(cols - 1, c.x + nx); x++) blocked.add(`${x},${z}`);
  };
  obstacles.forEach(o => mark(o.position, 0.32, 0.32));
  objects.filter(o => o.kind === 'furniture' || o.kind === 'custom').forEach(o => mark(o.position, Math.max(0.35, (o.widthMeters ?? 0.8) / 2 + 0.12), Math.max(0.35, (o.depthMeters ?? 0.6) / 2 + 0.12)));
  blocked.delete(`${s.x},${s.z}`); blocked.delete(`${g.x},${g.z}`);
  const key = (x: number, z: number) => `${x},${z}`;
  const heuristic = (x: number, z: number) => Math.hypot(g.x - x, g.z - z);
  const open: Node[] = [{ ...s, g: 0, f: heuristic(s.x, s.z) }];
  const best = new Map<string, number>([[key(s.x, s.z), 0]]);
  const closed = new Set<string>();
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
  let explored = 0;
  while (open.length && explored < cols * rows) {
    open.sort((a,b) => a.f - b.f);
    const current = open.shift()!; const ck = key(current.x,current.z);
    if (closed.has(ck)) continue;
    closed.add(ck); explored++;
    if (current.x === g.x && current.z === g.z) {
      const cells: Vec2[] = []; let n: Node | undefined = current;
      while (n) { cells.push(toWorld(n.x,n.z)); n = n.parent; }
      cells.reverse();
      const simplified = simplify(cells);
      const distanceMeters = simplified.slice(1).reduce((sum,p,i) => sum + Math.hypot(p.x - simplified[i]!.x, p.z - simplified[i]!.z), 0);
      return { points: simplified, distanceMeters, blocked: false, exploredNodes: explored };
    }
    for (const [dx,dz] of dirs) {
      const x=current.x+dx,z=current.z+dz,k=key(x,z);
      if(x<0||z<0||x>=cols||z>=rows||blocked.has(k)||closed.has(k)) continue;
      if(dx!==0&&dz!==0&&(blocked.has(key(current.x+dx,current.z))||blocked.has(key(current.x,current.z+dz)))) continue;
      const ng=current.g+(dx!==0&&dz!==0?Math.SQRT2:1)*cell;
      if(ng >= (best.get(k) ?? Infinity)) continue;
      best.set(k,ng); open.push({x,z,g:ng,f:ng+heuristic(x,z)*cell,parent:current});
    }
  }
  return null;
}
function simplify(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points;
  const out=[points[0]!]; let lastDx=0,lastDz=0;
  for(let i=1;i<points.length;i++) { const a=points[i-1]!,b=points[i]!; const dx=Math.sign(b.x-a.x),dz=Math.sign(b.z-a.z); if(i>1&&(dx!==lastDx||dz!==lastDz)) out.push(a); lastDx=dx;lastDz=dz; }
  out.push(points[points.length-1]!); return out;
}
