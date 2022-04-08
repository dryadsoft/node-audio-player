import React, { useMemo, useState } from "react";
import { PathContext } from "./context/context";
import Home from "./screens/Home";

function App() {
  const [path, setPath] = useState<string[]>([""]);
  const pathValue = useMemo(() => [path, setPath], [path]);
  return (
    <PathContext.Provider value={pathValue}>
      <Home />
    </PathContext.Provider>
  );
}

export default App;
