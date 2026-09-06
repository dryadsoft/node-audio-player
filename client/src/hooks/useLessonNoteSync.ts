import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import {
  clearLessonNoteDraft,
  loadLessonNoteDraft,
  saveLessonNoteDraft,
} from "../api/lessonNoteDrafts";
import {
  equal,
  mergeLessonNote,
  normalizeInk,
  NoteConflict,
} from "../api/mergeLessonNote";
import { InkStrokeV2, LessonCurriculumWeek } from "../types";
interface Session {
  recoveryBase?: LessonCurriculumWeek;
  base?: LessonCurriculumWeek;
  local: LessonCurriculumWeek;
  conflicts: NoteConflict[];
  saving: boolean;
  error: string;
  reset: number;
  ready: boolean;
}
export function useLessonNoteSync(
  id: string,
  week: number,
  server?: LessonCurriculumWeek
) {
  const key = `${id}:${week}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const sessions = useRef(new Map<string, Session>());
  const [, render] = useState(0);
  const refresh = useCallback(() => render((n) => n + 1), []);
  const interaction = useRef(false);
  const composing = useRef(false);
  const pending = useRef<LessonCurriculumWeek>();
  const session = sessions.current.get(key);
  const persist = useCallback(
    (k: string, s: Session) =>
      (equal(s.local, s.base) && !s.conflicts.length
        ? clearLessonNoteDraft(k)
        : saveLessonNoteDraft(
            k,
            s.local,
            s.conflicts.length ? s.recoveryBase : s.base
          )
      ).catch(() => {
        s.error = "이 장비 임시 저장에 실패했습니다.";
        refresh();
      }),
    [refresh]
  );
  const apply = useCallback((s: Session, remote: LessonCurriculumWeek) => {
    if (s.base && remote.revision <= s.base.revision) return;
    const result = equal(s.base, s.local)
      ? { merged: remote, conflicts: [] }
      : mergeLessonNote(s.base, s.local, remote);
    if (!equal(s.local.inkDocument, result.merged.inkDocument)) s.reset++;
    s.recoveryBase = result.conflicts.length ? s.base : undefined;
    s.base = remote;
    s.local = result.merged;
    s.conflicts = result.conflicts;
  }, []);
  useEffect(() => {
    pending.current = undefined;
    interaction.current = false;
    composing.current = false;
  }, [key]);
  useEffect(() => {
    if (!server || !id) return;
    let s = sessions.current.get(key);
    if (!s) {
      s = {
        base: server,
        local: server,
        conflicts: [],
        saving: false,
        error: "",
        reset: 0,
        ready: false,
      };
      sessions.current.set(key, s);
      const target = s;
      loadLessonNoteDraft(key)
        .then((record) => {
          if (record) {
            // Older records have no trustworthy ancestor and require explicit comparison.
            target.base = record.base;
            target.local = record.local;
            apply(target, server);
          }
          target.ready = true;
          refresh();
        })
        .catch(() => {
          target.ready = true;
          target.error = "임시 기록을 읽지 못했습니다.";
          refresh();
        });
      refresh();
    } else if (s.ready && !s.saving && !s.conflicts.length) {
      if (interaction.current || composing.current) {
        pending.current = server;
        return;
      }
      const latest =
        pending.current && pending.current.revision > server.revision
          ? pending.current
          : server;
      pending.current = undefined;
      apply(s, latest);
      persist(key, s);
      refresh();
    }
  }, [
    server,
    id,
    key,
    apply,
    refresh,
    persist,
    session?.ready,
    session?.saving,
  ]);
  const dirty = !!session && !equal(session.local, session.base);
  const blocked = interaction.current || composing.current;
  useEffect(() => {
    if (
      !session?.ready ||
      !dirty ||
      session.saving ||
      session.error ||
      session.conflicts.length ||
      blocked
    )
      return;
    const timer = window.setTimeout(async () => {
      const s = session;
      s.saving = true;
      refresh();
      let attempts = 0;
      try {
        while (true) {
          const sent = s.local;
          let saved: LessonCurriculumWeek | undefined;
          try {
            saved = await api.updateLessonCurriculumWeek({ ...sent, id });
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 409)
              throw error;
            if (attempts++ >= 3)
              throw new Error(
                "변경이 계속되고 있습니다. 저장 재시도를 눌러주세요."
              );
            const latest = await api.lessonCurriculumWeek(id, week);
            if (
              currentKey.current === key &&
              (interaction.current || composing.current)
            )
              pending.current = latest;
            else {
              apply(s, latest);
              await persist(key, s);
              refresh();
            }
          }
          if (!saved) {
            if (
              s.conflicts.length ||
              (currentKey.current === key &&
                (interaction.current || composing.current))
            )
              break;
            continue;
          }
          // Rebase input entered while this request was in flight onto its acknowledgement.
          s.local = {
            ...saved,
            className:
              s.local.className === sent.className
                ? saved.className
                : s.local.className,
            content:
              s.local.content === sent.content
                ? saved.content
                : s.local.content,
            inkDocument: equal(s.local.inkDocument, sent.inkDocument)
              ? saved.inkDocument
              : s.local.inkDocument,
          };
          s.base = saved;
          if (equal(s.local, saved)) await clearLessonNoteDraft(key);
          else await persist(key, s);
          break;
        }
      } catch (error) {
        s.error =
          error instanceof ApiError
            ? `저장 실패 (${error.status}): ${error.message}`
            : error instanceof TypeError
            ? "네트워크 연결을 확인하세요."
            : error instanceof Error
            ? error.message
            : "저장에 실패했습니다.";
      } finally {
        s.saving = false;
        refresh();
      }
    }, 700);
    return () => window.clearTimeout(timer);
  });
  const update = (
    changes:
      | Partial<LessonCurriculumWeek>
      | ((note: LessonCurriculumWeek) => LessonCurriculumWeek)
  ) => {
    if (!session?.ready) return;
    session.local =
      typeof changes === "function"
        ? changes(session.local)
        : { ...session.local, ...changes };
    session.conflicts = session.conflicts.map((conflict) => ({
      ...conflict,
      local: conflict.id.startsWith("stroke:")
        ? normalizeInk(session.local.inkDocument).strokes.find(
            (stroke) => stroke.id === conflict.id.slice(7)
          )
        : session.local[conflict.id as "className" | "content"],
    }));
    persist(key, session);
    refresh();
  };
  const settle = () => {
    if (
      !interaction.current &&
      !composing.current &&
      session &&
      pending.current
    ) {
      if (session.conflicts.length || session.saving) {
        refresh();
        return;
      }
      const remote = pending.current;
      pending.current = undefined;
      apply(session, remote);
      persist(key, session);
    }
    refresh();
  };
  useEffect(() => {
    const online = () => {
      const s = sessions.current.get(key);
      if (s) {
        s.error = "";
        refresh();
      }
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [key, refresh]);
  return {
    draft: session?.ready ? session.local : undefined,
    dirty,
    saveState: (session?.error
      ? "error"
      : session?.conflicts.length
      ? "conflict"
      : session?.saving
      ? "saving"
      : dirty
      ? "unsaved"
      : "saved") as "error" | "conflict" | "saving" | "unsaved" | "saved",
    error: session?.error,
    conflicts: session?.conflicts || [],
    resetKey: `${key}:${session?.reset || 0}`,
    update,
    retry: () => {
      if (session) {
        session.error = "";
        refresh();
      }
    },
    interaction: (active: boolean) => {
      interaction.current = active;
      settle();
    },
    composition: (active: boolean) => {
      composing.current = active;
      settle();
    },
    resolve: (conflict: NoteConflict, side: "local" | "server") => {
      if (!session) return;
      const value = conflict[side];
      if (conflict.id.startsWith("stroke:")) {
        const ink = normalizeInk(session.local.inkDocument);
        const strokes = ink.strokes.filter(
          (s) => s.id !== conflict.id.slice(7)
        );
        if (value) strokes.push(value as InkStrokeV2);
        session.local = { ...session.local, inkDocument: { ...ink, strokes } };
        session.reset++;
      } else session.local = { ...session.local, [conflict.id]: value };
      session.conflicts = session.conflicts.filter((c) => c.id !== conflict.id);
      persist(key, session);
      refresh();
    },
    forget: () => {
      sessions.current.delete(key);
      refresh();
    },
  };
}
