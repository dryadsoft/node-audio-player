import { fireEvent, render, screen } from "@testing-library/react";
import {
  beginAuthRecovery,
  clearAuthAttempt,
  hasAuthAttempt,
  useRecoveryState,
} from "./authRecovery";
afterEach(() => sessionStorage.clear());
it("allows one automatic attempt until confirmed recovery, with explicit manual retry", () => {
  const navigate = jest.fn();
  expect(beginAuthRecovery(false, navigate)).toBe(true);
  expect(navigate).toHaveBeenCalledWith("/api/auth/google/start?returnTo=%2F");
  expect(beginAuthRecovery(false, navigate)).toBe(false);
  expect(beginAuthRecovery(true, navigate)).toBe(true);
  clearAuthAttempt();
  expect(hasAuthAttempt()).toBe(false);
});
it("saves current filter values without copying drafts", () => {
  function Selection() {
    const [year, setYear] = useRecoveryState("plans.year", 2026);
    return <button onClick={() => setYear(2025)}>{year}</button>;
  }
  render(<Selection />);
  fireEvent.click(screen.getByRole("button"));
  beginAuthRecovery(false, jest.fn());
  expect(JSON.parse(sessionStorage.getItem("nmp.auth.return")!).values).toEqual(
    { "plans.year": 2025 }
  );
});
it("falls back to manual recovery if loop-guard storage is unavailable", () => {
  const getter = jest
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new Error("blocked");
    });
  const navigate = jest.fn();
  expect(beginAuthRecovery(false, navigate)).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  getter.mockRestore();
});
