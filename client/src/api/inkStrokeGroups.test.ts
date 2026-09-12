import {
  choiceStrokes,
  mergeStrokeGroups,
  replaceStrokeGroup,
} from "./inkStrokeGroups";
import { InkStrokeV2 } from "../types";

const stroke = (id: string, x = 0): InkStrokeV2 => ({
  id,
  page: 0,
  width: 4,
  color: "#111827",
  points: [
    [x, 0.5, 0.5, 0],
    [x + 0.1, 0.5, 0.5, 1],
  ],
});
const fragments = (name: string): InkStrokeV2[] => [
  { ...stroke("original", 0.1), sourceStrokeId: "original" },
  { ...stroke(name, 0.8), sourceStrokeId: "original" },
];

it("merges partial erasure against an unchanged original and independent writing", () => {
  const local = fragments("fragment");
  const result = mergeStrokeGroups([stroke("original")], local, [
    stroke("original"),
    stroke("new"),
  ]);
  expect(result.conflicts).toEqual([]);
  expect(result.strokes).toEqual([...local, stroke("new")]);
});

it("groups competing erasures into one conflict without joining incompatible fragments", () => {
  const local = fragments("left-fragment"),
    remote = fragments("right-fragment");
  const result = mergeStrokeGroups([stroke("original")], local, remote);
  expect(result.conflicts).toEqual([{ id: "original", local, server: remote }]);
  expect(result.strokes).toEqual(local);
  expect(
    replaceStrokeGroup(result.strokes, "original", result.conflicts[0].server)
  ).toEqual(remote);
});

it("retains partial erasure versus deletion as a conflict and resolves every fragment together", () => {
  const local = fragments("fragment");
  const result = mergeStrokeGroups([stroke("original")], local, []);
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0].server).toBeUndefined();
  expect(
    replaceStrokeGroup(
      [...result.strokes, stroke("other")],
      "original",
      undefined
    )
  ).toEqual([stroke("other")]);
});

it("finds the root after the fragment retaining the original id was erased", () => {
  const base = fragments("fragment");
  const local = [base[1]];
  expect(mergeStrokeGroups(base, local, base).strokes).toEqual(local);
  const result = mergeStrokeGroups(base, local, []);
  expect(result.conflicts[0].id).toBe("original");
  expect(replaceStrokeGroup(local, "original", undefined)).toEqual([]);
});

it("accepts old persisted single-stroke choices and preserves unrelated stroke order", () => {
  expect(choiceStrokes(stroke("old"))).toEqual([stroke("old")]);
  expect(choiceStrokes(undefined)).toEqual([]);
  expect(
    replaceStrokeGroup(
      [stroke("before"), stroke("old"), stroke("after")],
      "old",
      stroke("old", 0.3)
    )
  ).toEqual([stroke("before"), stroke("old", 0.3), stroke("after")]);
});

it("keeps the existing no-base conflict policy and accepts identical erasures", () => {
  const local = fragments("fragment");
  expect(mergeStrokeGroups(undefined, [], local).conflicts).toHaveLength(1);
  expect(mergeStrokeGroups(undefined, [], local, false).conflicts).toEqual([]);
  expect(
    mergeStrokeGroups([stroke("original")], local, local).conflicts
  ).toEqual([]);
});

it("accepts API field reordering without introducing phantom erasure conflicts", () => {
  const original = fragments("fragment");
  const reordered = original.map((s) => ({
    sourceStrokeId: s.sourceStrokeId,
    points: s.points,
    width: s.width,
    color: s.color,
    page: s.page,
    id: s.id,
  }));
  expect(
    mergeStrokeGroups([stroke("original")], original, reordered).conflicts
  ).toEqual([]);
});
