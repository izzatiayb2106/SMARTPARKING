import { useState } from "react";
import ReservedParking from "./components/ReservedParking";
import SmartZoneMonitor from "./components/SmartZoneMonitor";
import { CarIcon, BellIcon } from "./components/icons";
import "./components/SmartParking.css";

type Page = "reserved" | "smartzone";

export default function App() {
  const [page, setPage] = useState<Page>("reserved");

  if (page === "smartzone") {
    return <SmartZoneMonitor onBack={() => setPage("reserved")} />;
  }

  return (
    <div>
      <ReservedParking onNoticeClick={() => setPage("smartzone")} />

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
          className={`sp-tab ${page === "smartzone" ? "sp-tab--active" : ""}`}
          onClick={() => setPage("smartzone")}
        >
          <span className="sp-tab__icon"><BellIcon /></span>
          <span className="sp-tab__label">Smart Zone</span>
        </button>
      </div>
    </div>
  );
}