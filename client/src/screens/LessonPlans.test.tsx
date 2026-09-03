import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "react-query";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import LessonPlans from "./LessonPlans";
import { LessonPlan, LessonWeek } from "../types";

const currentYear = new Date().getFullYear();
const location = {
  id: "location-1",
  name: "서초 문화센터",
  active: true,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};
const weeks = (prefix = "봄"): LessonWeek[] =>
  Array.from({ length: 12 }, (_, index) => ({
    week: index + 1,
    className: index < 2 ? `${prefix} ${index + 1}주 수업` : "",
    content: index < 2 ? `${prefix} ${index + 1}주 내용` : "",
  }));
const plan = (
  id = "plan-1",
  term: LessonPlan["term"] = "spring",
): LessonPlan => ({
  id,
  year: currentYear,
  term,
  locationId: location.id,
  locationName: location.name,
  locationActive: true,
  curriculumId: null,
  programName: "오감별",
  sectionName: "월요일",
  documentTitle: "오감별 강의계획서 - 봄학기",
  courseName: "오감별",
  instructorName: "김강사",
  representativeProfile: "유아 통합놀이 지도 10년",
  courseIntroduction: "감각을 깨우는 통합놀이 과정입니다.",
  audience: "12~24개월 영아와 보호자",
  capacity: "10팀",
  scheduleDetails: "매주 월요일 10:00~10:50",
  tuition: "120,000원",
  materialFee: "20,000원",
  openLecture: "첫 주 공개",
  notice: "※ 사정상 수업의 순서는 바뀔 수 있습니다.",
  completedWeeks: 2,
  status: "draft",
  revision: 1,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
  weeks: weeks(term === "spring" ? "봄" : "여름"),
});

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);

const renderScreen = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={["/lesson-plans"]}>
          <LessonPlans />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
};

describe("LessonPlans", () => {
  beforeEach(() => {
    jest.spyOn(window, "fetch").mockImplementation((input, options) => {
      const url = String(input);
      if (url === "/api/lesson-locations?includeInactive=true") {
        return jsonResponse([location]);
      }
      if (url === "/api/lesson-plans" && !options?.method) {
        const summary = { ...plan(), weeks: undefined };
        return jsonResponse([summary]);
      }
      if (url === "/api/lesson-plans/plan-1") return jsonResponse(plan());
      return jsonResponse([]);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a seasonal plan with all twelve weeks", async () => {
    const { container } = renderScreen();

    expect(
      await screen.findByRole("heading", { name: "봄학기 · 서초 문화센터" }),
    ).toBeInTheDocument();
    expect(screen.getByText("봄 1주 수업")).toBeInTheDocument();
    expect(
      screen.getByText("감각을 깨우는 통합놀이 과정입니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /DOCX 다운로드/ })).toHaveAttribute(
      "href",
      "/api/lesson-plans/plan-1/docx",
    );
    expect(container.querySelectorAll(".week-detail-row")).toHaveLength(12);
    expect(screen.getByRole("link", { name: /음악 관리/ })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("saves an incomplete new plan with twelve week rows", async () => {
    let savedBody: Record<string, unknown> | undefined;
    (window.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo, options?: RequestInit) => {
        const url = String(input);
        if (url === "/api/lesson-locations?includeInactive=true")
          return jsonResponse([location]);
        if (url === "/api/lesson-plans" && options?.method === "POST") {
          savedBody = JSON.parse(String(options.body));
          return jsonResponse(
            {
              ...plan("new-plan"),
              ...(savedBody || {}),
              completedWeeks: 1,
              weeks: (savedBody?.weeks as LessonWeek[]) || [],
            },
            201,
          );
        }
        if (url === "/api/lesson-plans") return jsonResponse([]);
        return jsonResponse([]);
      },
    );
    renderScreen();

    await screen.findByRole("button", { name: /신규 등록/ });
    fireEvent.click(screen.getByRole("button", { name: /신규 등록/ }));
    fireEvent.change(screen.getByLabelText("1주차 수업명"), {
      target: { value: "첫 만남" },
    });
    fireEvent.change(screen.getByLabelText("1주차 수업내용"), {
      target: { value: "인사와 과정 소개" },
    });
    fireEvent.click(screen.getByRole("button", { name: /임시저장/ }));

    await waitFor(() => expect(savedBody).toBeDefined());
    expect(savedBody?.term).toBe("spring");
    expect(savedBody?.locationId).toBe(location.id);
    expect(savedBody?.programName).toBe("오감별");
    expect(savedBody?.sectionName).toBe("");
    expect(savedBody?.documentTitle).toBe("오감별 강의계획서 - 봄학기");
    expect(savedBody?.courseName).toBe("오감별");
    expect(savedBody?.notice).toBe("※ 사정상 수업의 순서는 바뀔 수 있습니다.");
    expect(savedBody?.weeks).toHaveLength(12);
    expect((savedBody?.weeks as LessonWeek[])[0]).toMatchObject({
      week: 1,
      className: "첫 만남",
      content: "인사와 과정 소개",
    });
  });

  it("opens a full copy as an editable unsaved plan", async () => {
    renderScreen();

    await screen.findByRole("heading", { name: "봄학기 · 서초 문화센터" });
    fireEvent.click(screen.getByRole("button", { name: /전체 복사/ }));

    expect(
      screen.getByRole("heading", { name: "전체 복사본 등록" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("1주차 수업명")).toHaveValue("봄 1주 수업");
    fireEvent.change(screen.getByLabelText("계획서 학기"), {
      target: { value: "summer" },
    });
    expect(screen.getByLabelText("계획서 학기")).toHaveValue("summer");
    expect(screen.getByLabelText("계획서 프로그램명")).toHaveValue("오감별");
    expect(screen.getByLabelText("계획서 수업 구분")).toHaveValue("월요일");
  });

  it("links a matching common note and previews its shared weeks", async () => {
    const curriculum = {
      id: "curriculum-1",
      year: currentYear,
      term: "spring",
      programName: "오감별",
      completedWeeks: 1,
      linkedPlanCount: 0,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
      weeks: weeks("공통").map((item) => ({
        ...item,
        lessonPlan: "",
        materials: "",
        hasInk: false,
        revision: 1,
        updatedAt: "2026-09-03T00:00:00.000Z",
      })),
    };
    (window.fetch as jest.Mock).mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/lesson-locations?includeInactive=true") {
        return jsonResponse([location]);
      }
      if (url === "/api/lesson-plans") {
        return jsonResponse([{ ...plan(), weeks: undefined }]);
      }
      if (url === "/api/lesson-plans/plan-1") return jsonResponse(plan());
      if (url === "/api/lesson-curricula") {
        const { weeks: _weeks, ...curriculumSummary } = curriculum;
        return jsonResponse([curriculumSummary]);
      }
      if (url === "/api/lesson-curricula/curriculum-1") {
        return jsonResponse(curriculum);
      }
      return jsonResponse([]);
    });
    renderScreen();

    await screen.findByRole("heading", { name: "봄학기 · 서초 문화센터" });
    fireEvent.click(screen.getByRole("button", { name: /수정/ }));
    fireEvent.change(screen.getByLabelText("계획서 공통 수업노트"), {
      target: { value: "curriculum-1" },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("1주차 수업명")).toHaveValue(
        "공통 1주 수업",
      ),
    );
    expect(screen.getByLabelText("1주차 수업명")).toBeDisabled();
    expect(
      screen.getByText(/수업명과 수업내용은 연결된 공통 수업노트에서 관리/),
    ).toBeInTheDocument();
  });

  it("registers a reusable lesson location", async () => {
    let createdName = "";
    (window.fetch as jest.Mock).mockImplementation(
      (input: RequestInfo, options?: RequestInit) => {
        const url = String(input);
        if (url === "/api/lesson-locations" && options?.method === "POST") {
          createdName = JSON.parse(String(options.body)).name;
          return jsonResponse(
            { ...location, id: "location-2", name: createdName },
            201,
          );
        }
        if (url === "/api/lesson-locations?includeInactive=true")
          return jsonResponse([location]);
        if (url === "/api/lesson-plans") return jsonResponse([]);
        return jsonResponse([]);
      },
    );
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /장소 관리/ }));
    fireEvent.change(screen.getByLabelText("새 장소 이름"), {
      target: { value: "마포 배움터" },
    });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() => expect(createdName).toBe("마포 배움터"));
    expect(
      await screen.findByText("‘마포 배움터’ 장소를 등록했습니다."),
    ).toBeInTheDocument();
  });

  it("maps selected source content into a chosen target week", async () => {
    const secondPlan = plan("plan-2", "summer");
    (window.fetch as jest.Mock).mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url === "/api/lesson-locations?includeInactive=true")
        return jsonResponse([location]);
      if (url === "/api/lesson-plans") {
        return jsonResponse([
          { ...plan(), weeks: undefined },
          { ...secondPlan, weeks: undefined },
        ]);
      }
      if (url === "/api/lesson-plans/plan-1") return jsonResponse(plan());
      if (url === "/api/lesson-plans/plan-2") return jsonResponse(secondPlan);
      return jsonResponse([]);
    });
    jest.spyOn(window, "confirm").mockReturnValue(true);
    renderScreen();

    await screen.findByRole("heading", { name: "봄학기 · 서초 문화센터" });
    fireEvent.click(screen.getByRole("button", { name: /수정/ }));
    fireEvent.click(screen.getByRole("button", { name: /주차 가져오기/ }));
    await screen.findByRole("heading", { name: "특정 주차 가져오기" });
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /1주차 여름 1주 수업/ }),
    );
    fireEvent.change(screen.getByLabelText("1주차 대상 주차"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "선택 주차 가져오기" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "2주차의 기존 내용을 덮어쓸까요?",
    );
    expect(screen.getByLabelText("2주차 수업명")).toHaveValue("여름 1주 수업");
    expect(screen.getByLabelText("2주차 수업내용")).toHaveValue(
      "여름 1주 내용",
    );
    expect(screen.getByLabelText("1주차 수업명")).toHaveValue("봄 1주 수업");
  });
});
