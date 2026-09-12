import { addUpdateGuard, updateBlockReason } from "./updateGuard";
it("reads live editor state and removes guards on unmount", () => {
  let reason = "필기 중";
  const remove = addUpdateGuard(() => reason);
  expect(updateBlockReason()).toBe("필기 중");
  reason = "";
  expect(updateBlockReason()).toBe("");
  reason = "저장 실패";
  remove();
  expect(updateBlockReason()).toBe("");
});
