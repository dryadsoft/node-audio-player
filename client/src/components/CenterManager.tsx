import { useEffect, useState } from "react";
import { useQuery } from "react-query";
import { api } from "../api";
import { CenterManagement } from "./LessonLocationDialog";
export default function CenterManager({
  onBack,
  onBusyChange,
}: {
  onBack: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  const query = useQuery("lessonLocations", api.lessonLocations);
  const [notice, setNotice] = useState({ message: "", type: "success" });
  return (
    <>
      {notice.message && (
        <p role={notice.type === "error" ? "alert" : "status"}>
          {notice.message}
        </p>
      )}
      {query.isError ? (
        <p role="alert">
          센터 목록을 불러오지 못했습니다.{" "}
          <button onClick={() => void query.refetch()}>다시 시도</button>
        </p>
      ) : null}
      {query.data ? (
        <CenterManagement
          online={online && !query.isError}
          locations={query.data}
          onClose={onBack}
          onBusyChange={onBusyChange}
          onNotice={(message, type = "success") => setNotice({ message, type })}
        />
      ) : query.isLoading ? (
        <p>센터 목록을 불러오는 중...</p>
      ) : null}
    </>
  );
}
