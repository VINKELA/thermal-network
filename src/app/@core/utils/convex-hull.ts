// @core/utils/convex-hull.ts

export interface Point { lat: number; lng: number; }

export function getConvexHull(points: Point[]): Point[] {
  // We need at least 3 points to define a boundary area
  if (points.length < 3) return []; 

  // 1. Sort points by X (Longitude) then Y (Latitude)
  const sorted = points.slice().sort((a, b) => {
    return a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng;
  });

  const crossProduct = (o: Point, a: Point, b: Point) => {
    return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  };

  // 2. Build Lower Hull
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // 3. Build Upper Hull
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // 4. Concatenate (remove duplicate start/end points)
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}