import { useState } from "react";
import { BackIcon, ReceiptIcon, HelpIcon, ScanIcon, ChevronDownIcon, CheckIcon } from "./icons";
import "./SmartParking.css";

const SMART_LETTER_COLORS = ["#E53935", "#F57C00", "#F9A825", "#388E3C", "#1565C0"];
const VEHICLES = ["JXU7505", "WBC1234", "KLM9988"];

interface ReservedParkingProps {
  onNoticeClick: () => void;
}

type View = "form" | "confirmed";

export default function ReservedParking({ onNoticeClick }: ReservedParkingProps) {
  const [view, setView] = useState<View>("form");
  const [vehicle, setVehicle] = useState("JXU7505");
  const [zone, setZone] = useState("Zone A – Level 1");
  const [discountCode, setDiscountCode] = useState("");

  const handleConfirm = () => {
    if (vehicle) setView("confirmed");
  };

  const handleDone = () => {
    setView("form");
    setDiscountCode("");
  };

  if (view === "confirmed") {
    return (
      <div className="sp-page">
        <div className="sp-header sp-header--rounded">
          <button className="sp-icon-btn--ghost" onClick={() => setView("form")}>
            <BackIcon />
          </button>
          <span className="sp-header__title">Booking Confirmed</span>
          <div className="sp-spacer" />
        </div>

        <div className="sp-confirm-body">
          <div className="sp-confirm-icon">
            <CheckIcon />
          </div>
          <h2 className="sp-confirm-title">Reservation Confirmed!</h2>
          <p className="sp-confirm-subtitle">Your parking bay has been reserved successfully.</p>

          <div className="sp-confirm-details">
            {[
              ["Vehicle", vehicle],
              ["Zone", zone],
              ["Bay", "Bay 14"],
              ["Valid Until", "17 Jun 2026, 11:59 PM"],
              ["Discount Code", discountCode || "—"],
            ].map(([label, val]) => (
              <div key={label} className="sp-confirm-row">
                <span className="sp-confirm-row__label">{label}</span>
                <span className="sp-confirm-row__value">{val}</span>
              </div>
            ))}
          </div>

          <button className="sp-btn--primary-wide" onClick={handleDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-page">
      {/* Header */}
      <div className="sp-header sp-header--extended">
        <button className="sp-icon-btn">
          <BackIcon />
        </button>
        <span className="sp-header__title">Smart Parking</span>
        <div className="sp-header__actions">
          <button className="sp-icon-btn">
            <ReceiptIcon />
          </button>
          <button className="sp-icon-btn">
            <HelpIcon />
          </button>
        </div>
      </div>

      {/* Logo card */}
      <div className="sp-logo-card">
        <div className="sp-logo-card__brand">
          <span className="sp-logo-card__brand-name">SUNWAY</span>
          <span className="sp-logo-card__brand-reg">®</span>
        </div>
        <div className="sp-logo-card__smart">
          {"SMART".split("").map((letter, i) => (
            <span
              key={i}
              className="sp-logo-card__smart-letter"
              style={{ color: SMART_LETTER_COLORS[i] }}
            >
              {letter}
            </span>
          ))}
        </div>
        <div className="sp-logo-card__parking">PARKING</div>
        <div className="sp-logo-card__taglines">
          {["HASSLE FREE", "CONVENIENT", "MULTI-PAYMENT"].map((t) => (
            <span key={t} className="sp-logo-card__tagline">• {t}</span>
          ))}
        </div>
      </div>

      {/* Tab row — rendered by parent App, but notice click is passed down */}
      {/* Tabs are in App.tsx; this component only renders its own content */}

      <div className="sp-content">
        <div className="sp-card">
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 20px" }}>
            Reserve Parking Bay
          </h2>

          {/* Vehicle */}
          <div className="sp-form-group">
            <label className="sp-label">Vehicle Number</label>
            <div className="sp-select-wrapper">
              <select
                className="sp-select"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              >
                {VEHICLES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <span className="sp-select-wrapper__chevron"><ChevronDownIcon /></span>
            </div>
          </div>

          {/* Zone */}
          <div className="sp-form-group">
            <label className="sp-label">Parking Zone</label>
            <div className="sp-select-wrapper">
              <select
                className="sp-select"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                <option>Zone A – Level 1</option>
                <option>Zone B – Level 2</option>
                <option>Zone C – Level 3</option>
              </select>
              <span className="sp-select-wrapper__chevron"><ChevronDownIcon /></span>
            </div>
          </div>

          {/* Discount code */}
          <div className="sp-form-group sp-form-group--last">
            <label className="sp-label">
              Discount Code <span className="sp-label__hint">(If any)</span>
            </label>
            <div className="sp-input-row">
              <input
                type="text"
                className="sp-input"
                placeholder="Enter code"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
              />
              <button className="sp-scan-btn">
                <ScanIcon />
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="sp-btn-row">
            <button className="sp-btn sp-btn--dark" onClick={() => setVehicle("JXU7505")}>
              Back
            </button>
            <button className="sp-btn sp-btn--primary" onClick={handleConfirm}>
              Confirm
            </button>
          </div>
        </div>

        {/* Announcement banner */}
        <div className="sp-banner" onClick={onNoticeClick}>
          <span style={{ fontSize: "18px" }}>📢</span>
          <span className="sp-banner__text">
            Parking rate update effective 1 July 2026 — tap to read more
          </span>
        </div>
      </div>
    </div>
  );
}
