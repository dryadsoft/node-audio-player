import { NavLink } from "react-router-dom";
import { FiBookOpen, FiMusic } from "react-icons/fi";

function AppNavigation() {
  return (
    <nav className="app-navigation" aria-label="주요 메뉴">
      <NavLink to="/" end>
        <FiMusic />
        음악 관리
      </NavLink>
      <NavLink to="/lesson-plans">
        <FiBookOpen />
        강의계획서
      </NavLink>
    </nav>
  );
}

export default AppNavigation;
