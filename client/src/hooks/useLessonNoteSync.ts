import { useEffect, useRef, useState } from "react";
import { equal, NoteConflict } from "../api/mergeLessonNote";
import { LessonCurriculumWeek } from "../types";
import { noteKey } from "../offline/noteStore";
import { sameNote } from "../offline/noteWorkspace";
import { useNoteWorkspace } from "../offline/useNoteWorkspace";

interface EditorSession {
  local: LessonCurriculumWeek;
  version: number;
  pending: number;
  error: string;
  reset: number;
}
export function useLessonNoteSync(id: string, week: number) {
  const state = useNoteWorkspace();
  const { workspace } = state;
  const key = noteKey(id, week);
  const record = state.notes.find((n) => n.key === key);
  const sessions = useRef(new Map<string, EditorSession>());
  const interaction = useRef(false),
    composing = useRef(false);
  const [tick, render] = useState(0);
  const refresh = () => render((n) => n + 1);
  let session = sessions.current.get(key);
  if (!session && record) {
    session = {
      local: record.local,
      version: record.version,
      pending: 0,
      error: "",
      reset: 0,
    };
    sessions.current.set(key, session);
  }
  useEffect(() => {
    interaction.current = false;
    composing.current = false;
    return () => workspace.block(key, false);
  }, [workspace, key]);
  useEffect(() => {
    if (
      !session ||
      !record ||
      session.pending ||
      session.error ||
      interaction.current ||
      composing.current ||
      session.version === record.version
    )
      return;
    if (!equal(session.local.inkDocument, record.local.inkDocument))
      session.reset++;
    session.local = record.local;
    session.version = record.version;
    render((n) => n + 1);
  }, [session, record, tick]);
  const readOnly = !!state.curricula.find((c) => c.id === id)?.deleted;
  const error = session?.error || record?.error || state.storageError;
  const dirty = !!session && !sameNote(record?.base, session.local);
  const saveState = error
    ? "error"
    : record?.conflicts.length
    ? "conflict"
    : session?.pending
    ? "storing"
    : state.saving.includes(key)
    ? "saving"
    : dirty
    ? "unsaved"
    : "saved";
  const update = (
    changes:
      | Partial<LessonCurriculumWeek>
      | ((note: LessonCurriculumWeek) => LessonCurriculumWeek)
  ) => {
    if (!session || readOnly) return;
    const target = session,
      expected = target.local;
    const next =
      typeof changes === "function"
        ? changes(expected)
        : { ...expected, ...changes };
    target.local = next;
    target.pending++;
    target.error = "";
    refresh();
    workspace
      .edit(key, expected, next)
      .catch(() => {
        target.error =
          "기기에 저장하지 못했습니다. 입력을 내보내거나 저장을 다시 시도하세요.";
      })
      .finally(() => {
        target.pending--;
        if (!target.pending && !workspace.hasUnstored(key)) target.error = "";
        refresh();
      });
  };
  const settle = () => {
    workspace.block(key, interaction.current || composing.current);
    refresh();
  };
  return {
    draft: session?.local,
    dirty,
    saveState,
    error,
    readOnly,
    conflicts: record?.conflicts || [],
    resetKey: `${key}:${session?.reset || 0}`,
    update,
    retry: async () => {
      await workspace.retry();
      if (session && !workspace.getSnapshot().storageError) session.error = "";
      refresh();
    },
    interaction: (active: boolean) => {
      interaction.current = active;
      settle();
    },
    composition: (active: boolean) => {
      composing.current = active;
      settle();
    },
    resolve: (conflict: NoteConflict, side: "local" | "server") =>
      workspace.resolve(key, conflict, side),
    forget: () => {
      sessions.current.delete(key);
      refresh();
    },
  };
}
