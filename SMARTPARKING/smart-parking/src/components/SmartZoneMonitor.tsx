import { useState, useEffect } from "react";
import { BackIcon } from "./icons";
import "./SmartParking.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type SpotStatus = "AVAILABLE" | "PENDING_VALIDATION" | "CHARGING";
type ActiveAlert = null | "UNAUTHORIZED_ALERT" | "OVERSTAY_ALERT";

interface EVBay {
  id: string;
  label: string;
  level: string;
}

interface BayRuntimeState {
  spotStatus: SpotStatus;
  activeAlert: ActiveAlert;
  validationTimeLeft: number;
  overstayTimeLeft: number;
  validationActive: boolean;
  overstayActive: boolean;
  showAlertPopup: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALIDATION_SECONDS   = 120;       // 2 minutes
const OVERSTAY_SECONDS     = 15;        // 15 s for demo (replace with 7200 for production)
const CHARGING_FEE_PER_KWH = "RM 1.60";
const IDLE_FEE_PER_MIN     = "RM 0.40";

const EV_BAYS: EVBay[] = [
  { id: "EV-01", label: "Bay EV-01", level: "Level B1" },
  { id: "EV-02", label: "Bay EV-02", level: "Level B1" },
  { id: "EV-03", label: "Bay EV-03", level: "Level B2" },
 
];

function createBayRuntimeState(): BayRuntimeState {
  return {
    spotStatus: "AVAILABLE",
    activeAlert: null,
    validationTimeLeft: VALIDATION_SECONDS,
    overstayTimeLeft: OVERSTAY_SECONDS,
    validationActive: false,
    overstayActive: false,
    showAlertPopup: false,
  };
}

function createInitialBayStates(): Record<string, BayRuntimeState> {
  return EV_BAYS.reduce<Record<string, BayRuntimeState>>((acc, bay) => {
    acc[bay.id] = createBayRuntimeState();
    return acc;
  }, {});
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EVStatusBadge({ status }: { status: SpotStatus }) {
  const map: Record<SpotStatus, { label: string; className: string }> = {
    AVAILABLE:          { label: "Available",          className: "szm-badge szm-badge--available" },
    PENDING_VALIDATION: { label: "Pending Validation", className: "szm-badge szm-badge--pending" },
    CHARGING:           { label: "Charging",           className: "szm-badge szm-badge--charging" },
  };
  const { label, className } = map[status];
  return <span className={className}>{label}</span>;
}

interface FloatingAlertProps {
  show: boolean;
  bayId: string;
  message: string;
  type: "unauthorized" | "overstay";
  onDismiss: () => void;
}

function FloatingAlert({ show, bayId, message, onDismiss, type }: FloatingAlertProps) {
  const isUnauth = type === "unauthorized";
  return (
    <div className={`szm-floating-alert szm-floating-alert--${type} ${show ? "szm-floating-alert--visible" : ""}`}>
      <div className="szm-floating-alert__icon-wrap">
        <span className="szm-floating-alert__icon">{isUnauth ? "🚨" : "⏰"}</span>
      </div>
      <div className="szm-floating-alert__body">
        <p className="szm-floating-alert__label">{isUnauth ? "UNAUTHORIZED ALERT" : "OVERSTAY ALERT"}</p>
        <p className="szm-floating-alert__bay">{bayId}</p>
        <p className="szm-floating-alert__msg">{message}</p>
      </div>
      <button className="szm-floating-alert__dismiss" onClick={onDismiss}>✕</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SmartZoneMonitorProps {
  onBack: () => void;
}

export default function SmartZoneMonitor({ onBack }: SmartZoneMonitorProps) {

  // ── State ──
  const [selectedBay, setSelectedBay] = useState<EVBay | null>(null);
  const [bayStates, setBayStates] = useState<Record<string, BayRuntimeState>>(createInitialBayStates);

  const selectedBayState = selectedBay ? bayStates[selectedBay.id] : null;

  const updateBayState = (bayId: string, updater: (state: BayRuntimeState) => BayRuntimeState) => {
    setBayStates((prev) => {
      const currentState = prev[bayId] ?? createBayRuntimeState();
      return {
        ...prev,
        [bayId]: updater(currentState),
      };
    });
  };

  // ── Master Timer Effect ──
  useEffect(() => {
    const interval = setInterval(() => {
      setBayStates((prev) => {
        let changed = false;
        const nextStates = { ...prev };

        for (const bay of EV_BAYS) {
          const state = prev[bay.id];
          if (!state) continue;

          let nextState = state;

          if (state.validationActive) {
            const nextValidationTimeLeft = state.validationTimeLeft - 1;
            if (nextValidationTimeLeft <= 0) {
              nextState = {
                ...state,
                spotStatus: "AVAILABLE",
                activeAlert: "UNAUTHORIZED_ALERT",
                validationTimeLeft: 0,
                overstayTimeLeft: 0,
                validationActive: false,
                overstayActive: false,
                showAlertPopup: true,
              };
            } else {
              nextState = {
                ...state,
                validationTimeLeft: nextValidationTimeLeft,
              };
            }
          } else if (state.overstayActive) {
            const nextOverstayTimeLeft = state.overstayTimeLeft - 1;
            if (nextOverstayTimeLeft <= 0) {
              nextState = {
                ...state,
                activeAlert: "OVERSTAY_ALERT",
                overstayTimeLeft: 0,
                overstayActive: false,
                showAlertPopup: true,
              };
            } else {
              nextState = {
                ...state,
                overstayTimeLeft: nextOverstayTimeLeft,
              };
            }
          }

          if (nextState !== state) {
            nextStates[bay.id] = nextState;
            changed = true;
          }
        }

        return changed ? nextStates : prev;
      });

    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ── Triggers ──

  const handleSelectBay = (bay: EVBay) => {
    // Tapping the already-selected bay unselects it
    const isUnselecting = selectedBay?.id === bay.id;
    setSelectedBay(isUnselecting ? null : bay);
  };

  const handleSensorDetect = () => {
    if (!selectedBay || selectedBayState?.spotStatus !== "AVAILABLE") return;
    updateBayState(selectedBay.id, (state) => ({
      ...state,
      spotStatus: "PENDING_VALIDATION",
      activeAlert: null,
      showAlertPopup: false,
      validationTimeLeft: VALIDATION_SECONDS,
      overstayTimeLeft: OVERSTAY_SECONDS,
      validationActive: true,
      overstayActive: true,
    }));
  };

  const handleUserValidate = () => {
    if (!selectedBay || selectedBayState?.spotStatus !== "PENDING_VALIDATION") return;
    updateBayState(selectedBay.id, (state) => ({
      ...state,
      spotStatus: "CHARGING",
      validationActive: false,
    }));
  };

  const handleSensorClear = () => {
    if (!selectedBay) return;
    updateBayState(selectedBay.id, () => createBayRuntimeState());
  };

  // ── Derived ──
  const isOccupied = selectedBayState ? selectedBayState.spotStatus !== "AVAILABLE" : false;
  const showValTimer = selectedBayState?.spotStatus === "PENDING_VALIDATION";
  const showOvTimer = selectedBayState?.spotStatus === "CHARGING" || selectedBayState?.activeAlert === "OVERSTAY_ALERT";

  return (
    <div className="sp-page">
      {/* Header */}
      <div className="sp-header sp-header--rounded">
        <button className="sp-icon-btn--ghost" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="sp-header__title">Smart Zone Monitor</span>
        <div className="sp-spacer" />
      </div>

      <div className="sp-content">

        {/* ── Bay Selector ── */}
        <div className="sp-card szm-selector-card">
          <p className="szm-selector-title">Select EV Charging Bay</p>
          <div className="szm-bay-list">
            {EV_BAYS.map((bay) => (
              <button
                key={bay.id}
                className={`szm-bay-btn ${selectedBay?.id === bay.id ? "szm-bay-btn--active" : ""}`}
                onClick={() => handleSelectBay(bay)}
              >
                <span className="szm-bay-btn__icon">🔌</span>
                <span className="szm-bay-btn__label">{bay.label}</span>
                <span className="szm-bay-btn__level">{bay.level}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Fee Info Card (shown only after selecting a bay) ── */}
        {selectedBay && (
          <>
            <div className="sp-card szm-fee-card">
              <p className="szm-fee-title">Pricing — {selectedBay.label}</p>
              <div className="szm-fee-row">
                <div className="szm-fee-item">
                  
                  <div>
                    <p className="szm-fee-item__label">Charging Fee</p>
                    <p className="szm-fee-item__rate">{CHARGING_FEE_PER_KWH}<span className="szm-fee-item__unit">/kWh</span></p>
                  </div>
                </div>
                <div className="szm-fee-divider" />
                <div className="szm-fee-item">
                  
                  <div>
                    <p className="szm-fee-item__label">Idle Fee</p>
                    <p className="szm-fee-item__rate">{IDLE_FEE_PER_MIN}<span className="szm-fee-item__unit">/min</span></p>
                  </div>
                </div>
              </div>
              <p className="szm-fee-note">Idle fee applies after charging is complete and vehicle remains parked.</p>
            </div>

            {/* ── Bay Info Card ── */}
            <div className="sp-card szm-bay-card">
              <div className="szm-bay-header">
                <div>
                  <p className="szm-bay-label">EV Charging Bay</p>
                  <h2 className="szm-bay-id">{selectedBay.label}</h2>
                  <p className="szm-bay-level">{selectedBay.level}</p>
                </div>
                <EVStatusBadge status={selectedBayState?.spotStatus ?? "AVAILABLE"} />
              </div>

              <div className="szm-bay-icon-row">
                <span className="szm-ev-icon">{isOccupied ? "🔌" : "🅿️"}</span>
                <p className="szm-bay-sublabel">
                  {selectedBayState?.spotStatus === "AVAILABLE" && "No vehicle detected"}
                  {selectedBayState?.spotStatus === "PENDING_VALIDATION" && "Awaiting EV owner validation…"}
                  {selectedBayState?.spotStatus === "CHARGING" && "EV vehicle actively charging"}
                </p>
              </div>
            </div>

            {/* ── Timer Cards ── */}
            {(showValTimer || showOvTimer) && (
              <div className="szm-timer-row">
                {showValTimer && (
                  <div className={`szm-timer-card szm-timer-card--validation ${selectedBayState!.validationTimeLeft <= 30 ? "szm-timer-card--urgent" : ""}`}>
                    <p className="szm-timer-card__label">Validation Timer</p>
                    <p className="szm-timer-card__time">{formatTime(selectedBayState!.validationTimeLeft)}</p>
                    <p className="szm-timer-card__hint">Time to scan app</p>
                  </div>
                )}
                {showOvTimer && (
                  <div className={`szm-timer-card szm-timer-card--overstay ${selectedBayState!.overstayTimeLeft <= 60 ? "szm-timer-card--urgent" : ""}`}>
                    <p className="szm-timer-card__label">Overstay Timer</p>
                    <p className="szm-timer-card__time">{formatTime(selectedBayState!.overstayTimeLeft)}</p>
                    <p className="szm-timer-card__hint">Max charging limit</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Simulation Controls ── */}
            <div className="sp-card szm-controls-card">
              <p className="szm-controls-title">Simulation Controls</p>
              <p className="szm-controls-hint">Tap buttons below to simulate hardware sensor events</p>

              <div className="szm-control-group">
                <button
                  className="szm-ctrl-btn szm-ctrl-btn--detect"
                  onClick={handleSensorDetect}
                  disabled={selectedBayState?.spotStatus !== "AVAILABLE"}
                >
                  <span className="szm-ctrl-btn__icon">🚗</span>
                  <span className="szm-ctrl-btn__label">Sensor: Car Parks</span>
                  <span className="szm-ctrl-btn__sub">isOccupied → true</span>
                </button>

                <button
                  className="szm-ctrl-btn szm-ctrl-btn--validate"
                  onClick={handleUserValidate}
                  disabled={selectedBayState?.spotStatus !== "PENDING_VALIDATION"}
                >
                  <span className="szm-ctrl-btn__icon">📱</span>
                  <span className="szm-ctrl-btn__label">User Validates App</span>
                  <span className="szm-ctrl-btn__sub">EV ownership confirmed</span>
                </button>

                <button
                  className="szm-ctrl-btn szm-ctrl-btn--clear"
                  onClick={handleSensorClear}
                  disabled={!isOccupied && selectedBayState?.activeAlert === null}
                >
                  <span className="szm-ctrl-btn__icon">🏁</span>
                  <span className="szm-ctrl-btn__label">Sensor: Car Leaves</span>
                  <span className="szm-ctrl-btn__sub">isOccupied → false</span>
                </button>
              </div>
            </div>

            {/* ── Live State Debug Panel ──
            <div className="szm-debug-panel">
              <p className="szm-debug-panel__title">Live State — {selectedBay.label}</p>
              <div className="szm-debug-panel__rows">
                <div className="szm-debug-row">
                  <span className="szm-debug-key">spotStatus</span>
                  <span className="szm-debug-val">{spotStatus}</span>
                </div>
                <div className="szm-debug-row">
                  <span className="szm-debug-key">activeAlert</span>
                  <span className="szm-debug-val">{activeAlert ?? "null"}</span>
                </div>
                <div className="szm-debug-row">
                  <span className="szm-debug-key">validationTimeLeft</span>
                  <span className="szm-debug-val">{validationTimeLeft}s</span>
                </div>
                <div className="szm-debug-row">
                  <span className="szm-debug-key">overstayTimeLeft</span>
                  <span className="szm-debug-val">{overstayTimeLeft}s</span>
                </div>
                <div className="szm-debug-row">
                  <span className="szm-debug-key">isOccupied</span>
                  <span className="szm-debug-val">{String(isOccupied)}</span>
                </div>
              </div>
            </div> */}
          </>
        )}

      </div>

      {/* ── Floating Alert Popup ── */}
      <FloatingAlert
        show={selectedBayState?.showAlertPopup ?? false}
        bayId={selectedBay?.label ?? "Bay EV"}
        type={selectedBayState?.activeAlert === "UNAUTHORIZED_ALERT" ? "unauthorized" : "overstay"}
        message={
          selectedBayState?.activeAlert === "UNAUTHORIZED_ALERT"
            ? "Vehicle has not validated EV ownership within 2 minutes. Security has been notified."
            : "Vehicle has exceeded the 2-hour EV charging limit. Penalty notification sent to driver."
        }
        onDismiss={() => {
          if (!selectedBay) return;
          updateBayState(selectedBay.id, (state) => ({
            ...state,
            showAlertPopup: false,
          }));
        }}
      />

    </div>
  );
}