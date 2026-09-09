import { createContext, useContext, useEffect, useState } from "react";
import { NoteWorkspace } from "./noteWorkspace";

export const NoteWorkspaceContext = createContext(new NoteWorkspace());
export function useNoteWorkspace() {
  const workspace = useContext(NoteWorkspaceContext);
  const [snapshot, setSnapshot] = useState(workspace.getSnapshot);
  useEffect(() => {
    const unsubscribe = workspace.subscribe(() =>
      setSnapshot(workspace.getSnapshot())
    );
    setSnapshot(workspace.getSnapshot());
    const stop = workspace.start();
    return () => {
      unsubscribe();
      stop();
    };
  }, [workspace]);
  return { workspace, ...snapshot };
}
export function NoteWorkspaceLifecycle() {
  useNoteWorkspace();
  return null;
}
export function useLocalCurriculum(id: string) {
  const state = useNoteWorkspace();
  const data = state.workspace.detail(id);
  return {
    data,
    availableWeeks: state.notes
      .filter((n) => n.id === id)
      .map((n) => n.local.week),
    isLoading: !!id && !data && (!state.hydrated || state.fetching),
    isError: !!id && !data && !!state.error,
    refetch: () => state.workspace.refresh(true),
  };
}
