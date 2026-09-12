import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import ManagementDialog from "./ManagementDialog";
it("traps focus including selects and textareas, then restores the opener on Escape", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>관리 열기</button>
        {open && (
          <ManagementDialog title="관리" onClose={() => setOpen(false)}>
            <select aria-label="센터">
              <option>센터</option>
            </select>
            <textarea aria-label="내용" />
            <div hidden>
              <button>숨긴 버튼</button>
            </div>
          </ManagementDialog>
        )}
      </>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "관리 열기" });
  opener.focus();
  fireEvent.click(opener);
  const close = screen.getByRole("button", { name: "관리 닫기" }),
    text = screen.getByLabelText("내용");
  close.focus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(text).toHaveFocus();
  fireEvent.keyDown(text, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
it("blocks closing while work is pending", () => {
  const close = jest.fn();
  const view = render(
    <ManagementDialog title="관리" busy onClose={close}>
      저장 중
    </ManagementDialog>
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "관리 닫기" }));
  expect(close).not.toHaveBeenCalled();
  view.rerender(
    <ManagementDialog title="관리" onClose={close}>
      저장 완료
    </ManagementDialog>
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
});
