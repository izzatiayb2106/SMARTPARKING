import { useState } from "react";
import ReservedParking from "./components/ReservedParking";
import Notice from "./components/Notice";
import { CarIcon, BellIcon } from "./components/icons";
import "./components/SmartParking.css";

type Page = "reserved" | "notice";

export default function App() {
  const [page, setPage] = useState<Page>("reserved");

  if (page === "notice") {
    return <Notice onBack={() => setPage("reserved")} />;
  }

  return (
    <div>
      <ReservedParking onNoticeClick={() => setPage("notice")} />

      {/* Bottom tab bar */}
      <div className="sp-tabs" style={{ margin: "0 16px 16px", position: "sticky", bottom: 16 }}>
        <button
          className={`sp-tab ${page === "reserved" ? "sp-tab--active" : ""}`}
          onClick={() => setPage("reserved")}
        >
          <span className="sp-tab__icon"><CarIcon /></span>
          <span className="sp-tab__label">Reserved Parking</span>
        </button>
        <button
          className={`sp-tab ${page === "notice" ? "sp-tab--active" : ""}`}
          onClick={() => setPage("notice")}
        >
          <span className="sp-tab__icon"><BellIcon /></span>
          <span className="sp-tab__label">Notice</span>
        </button>
      </div>
    </div>
  );
}
