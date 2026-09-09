import { fullCorners, projection } from "./photo";
const project = (m: number[], x: number, y: number) => {
  const q = m[6] * x + m[7] * y + 1;
  return [(m[0] * x + m[1] * y + m[2]) / q, (m[3] * x + m[4] * y + m[5]) / q];
};
it("maps the corrected page back to the photographed four corners", () => {
  const c = [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.05 },
      { x: 0.9, y: 0.85 },
      { x: 0.05, y: 0.9 },
    ],
    m = projection(c);
  fullCorners.forEach((p, i) => {
    const point = project(m, p.x, p.y);
    expect(point[0]).toBeCloseTo(c[i].x);
    expect(point[1]).toBeCloseTo(c[i].y);
  });
});
it("retains identity and rejects crossed or collapsed corners", () => {
  expect(project(projection(fullCorners), 0.4, 0.7)).toEqual([0.4, 0.7]);
  expect(() =>
    projection([fullCorners[0], fullCorners[2], fullCorners[1], fullCorners[3]])
  ).toThrow();
  expect(() =>
    projection(fullCorners.map(() => ({ x: 0.5, y: 0.5 })))
  ).toThrow();
});
it("precache includes the current image worker for offline imports", () => {
  const fs = require("fs"),
    path = require("path"),
    crypto = require("crypto");
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../public/attendance-photo-worker.js")
  );
  const hash = crypto
    .createHash("sha256")
    .update(source)
    .digest("hex")
    .slice(0, 16);
  expect(
    fs.readFileSync(path.resolve(__dirname, "../service-worker.js"), "utf8")
  ).toContain(hash);
});
