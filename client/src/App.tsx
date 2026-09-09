import Attendance from "./screens/Attendance";
import { AttendanceLifecycle } from "./attendance/workspace";
import { NoteWorkspaceLifecycle } from "./offline/useNoteWorkspace";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import Home from "./screens/Home";
import LessonPlans from "./screens/LessonPlans";
import LessonNotes from "./screens/LessonNotes";

function App() {
  return (
    <ThemeProvider>
      <NoteWorkspaceLifecycle />
      <AttendanceLifecycle />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lesson-plans" element={<LessonPlans />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/lesson-notes" element={<LessonNotes />} />
          <Route path="/search" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
