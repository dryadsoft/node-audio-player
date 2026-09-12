import { InkStrokeV2 } from "../types";

// API normalizers can reorder optional stroke fields. Compare JSON values,
// not key insertion order, so a save acknowledgement is not a new edit.
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => equal(value, b[index]))
    );
  }
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return (
    keys.length ===
      Object.keys(right).filter((key) => right[key] !== undefined).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        equal(left[key], right[key])
    )
  );
}

// Single strokes remain accepted for conflicts saved by older app versions.
export type StrokeChoice = InkStrokeV2 | InkStrokeV2[] | undefined;
export const strokeSourceId = (stroke: InkStrokeV2) =>
  stroke.sourceStrokeId ?? stroke.id;
export const choiceStrokes = (choice: StrokeChoice): InkStrokeV2[] =>
  choice ? (Array.isArray(choice) ? choice : [choice]) : [];

function groups(strokes: InkStrokeV2[] = []) {
  const result = new Map<string, InkStrokeV2[]>();
  for (const stroke of strokes) {
    const key = strokeSourceId(stroke);
    const group = result.get(key);
    if (group) group.push(stroke);
    else result.set(key, [stroke]);
  }
  return result;
}

const choice = (strokes: InkStrokeV2[] | undefined): StrokeChoice =>
  !strokes?.length ? undefined : strokes.length === 1 ? strokes[0] : strokes;

export const strokeGroupChoice = (
  strokes: InkStrokeV2[],
  id: string
): StrokeChoice =>
  choice(strokes.filter((stroke) => strokeSourceId(stroke) === id));

export function mergeStrokeGroups(
  base: InkStrokeV2[] | undefined,
  local: InkStrokeV2[],
  remote: InkStrokeV2[],
  requireBase = true
) {
  const b = groups(base),
    l = groups(local),
    r = groups(remote);
  const strokes: InkStrokeV2[] = [];
  const conflicts: { id: string; local: StrokeChoice; server: StrokeChoice }[] =
    [];
  const knownBase = base !== undefined || !requireBase;
  for (const id of Array.from(
    new Set([
      ...Array.from(b.keys()),
      ...Array.from(l.keys()),
      ...Array.from(r.keys()),
    ])
  )) {
    const bs = b.get(id),
      ls = l.get(id),
      rs = r.get(id);
    let selected = ls;
    if (equal(ls, rs)) selected = ls;
    else if (knownBase && equal(ls, bs)) selected = rs;
    else if (knownBase && equal(rs, bs)) selected = ls;
    else conflicts.push({ id, local: choice(ls), server: choice(rs) });
    if (selected) strokes.push(...selected);
  }
  return { strokes, conflicts };
}

export function replaceStrokeGroup(
  strokes: InkStrokeV2[],
  id: string,
  choice: StrokeChoice
) {
  const replacements = choiceStrokes(choice);
  const result: InkStrokeV2[] = [];
  let inserted = false;
  for (const stroke of strokes) {
    if (strokeSourceId(stroke) === id) {
      if (!inserted) result.push(...replacements);
      inserted = true;
    } else result.push(stroke);
  }
  if (!inserted) result.push(...replacements);
  return result;
}
