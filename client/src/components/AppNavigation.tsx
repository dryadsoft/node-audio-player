import { NavLink } from "react-router-dom";
import { FiBookOpen, FiMoon, FiMusic, FiSun } from "react-icons/fi";
import { useTheme } from "../context/ThemeContext";

function AppNavigation() {
  const { theme, toggleTheme } = useTheme();
  const lightMode = theme === "light";

  return (
    <nav className="app-navigation" aria-label="주요 메뉴">
      <div className="app-navigation-links">
        <NavLink to="/" end>
          <FiMusic />
          음악 관리
        </NavLink>
        <NavLink to="/lesson-plans">
          <FiBookOpen />
          강의계획서
        </NavLink>
      </div>
      <button
        type="button"
        className="theme-toggle"
        aria-label={lightMode ? "다크 모드로 전환" : "라이트 모드로 전환"}
        title={lightMode ? "다크 모드로 전환" : "라이트 모드로 전환"}
        onClick={toggleTheme}
      >
        {lightMode ? <FiMoon aria-hidden="true" /> : <FiSun aria-hidden="true" />}
        <span>{lightMode ? "다크" : "라이트"}</span>
      </button>
    </nav>
  );
}

export default AppNavigation;
