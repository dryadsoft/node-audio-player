import { useMemo, useState } from "react";
import { KeywordContext, PathContext } from "./context/context";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./screens/Home";
import Search from "./screens/Search";

function App() {
  const [path, setPath] = useState<string[]>([""]);
  const [keyword, setKeyword] = useState("");
  const pathValue = useMemo(() => [path, setPath], [path]);
  const keywordValue = useMemo(() => [keyword, setKeyword], [keyword]);
  return (
    <PathContext.Provider value={pathValue}>
      <KeywordContext.Provider value={keywordValue}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
          </Routes>
        </BrowserRouter>
      </KeywordContext.Provider>
    </PathContext.Provider>
  );
}

export default App;
