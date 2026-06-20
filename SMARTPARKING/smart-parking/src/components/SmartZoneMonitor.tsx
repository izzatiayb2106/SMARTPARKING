import { useState, useEffect } from "react";
import { BackIcon } from "./icons";
import "./SmartParking.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type SpotStatus = "AVAILABLE" | "PENDING_VALIDATION" | "CHARGING" | "CHARGING_COMPLETE";
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
  chargingTimeLeft: number;
  overstayTimeLeft: number;
  validationActive: boolean;
  chargingActive: boolean;
  overstayActive: boolean;
  showAlertPopup: boolean;
  ownerSessionId: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALIDATION_SECONDS   = 15;       // 2 minutes
const CHARGING_SECONDS     = 30;        // demo charging duration
const OVERSTAY_SECONDS     = 15;        // grace period after charging completes
const CHARGING_FEE_PER_KWH = "RM 1.60";
const IDLE_FEE_PER_MIN     = "RM 0.40";

const EV_BAYS: EVBay[] = [
  { id: "EV-01", label: "Bay EV-01", level: "Level B1" },
  { id: "EV-02", label: "Bay EV-02", level: "Level B1" },
  { id: "EV-03", label: "Bay EV-03", level: "Level B2" },
 
];

const BAY_STATES_STORAGE_KEY = "smart-zone-bay-states-v1";
const SESSION_ID_STORAGE_KEY = "smart-zone-session-id-v1";

function getSessionId(): string {
  if (typeof window === "undefined") return "server-session";

  const existing = window.sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (existing) return existing;

  const generated = `session-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  window.sessionStorage.setItem(SESSION_ID_STORAGE_KEY, generated);
  return generated;
}

function createBayRuntimeState(): BayRuntimeState {
  return {
    spotStatus: "AVAILABLE",
    activeAlert: null,
    validationTimeLeft: VALIDATION_SECONDS,
    chargingTimeLeft: CHARGING_SECONDS,
    overstayTimeLeft: OVERSTAY_SECONDS,
    validationActive: false,
    chargingActive: false,
    overstayActive: false,
    showAlertPopup: false,
    ownerSessionId: null,
  };
}

function createInitialBayStates(): Record<string, BayRuntimeState> {
  return EV_BAYS.reduce<Record<string, BayRuntimeState>>((acc, bay) => {
    acc[bay.id] = createBayRuntimeState();
    return acc;
  }, {});
}

function coercePersistedBayStates(payload: unknown): Record<string, BayRuntimeState> {
  const defaultStates = createInitialBayStates();
  if (!payload || typeof payload !== "object") return defaultStates;

  const persisted = payload as Record<string, Partial<BayRuntimeState>>;
  for (const bay of EV_BAYS) {
    const incoming = persisted[bay.id];
    if (!incoming || typeof incoming !== "object") continue;

    const status = incoming.spotStatus;
    const activeAlert = incoming.activeAlert;

    defaultStates[bay.id] = {
      spotStatus:
        status === "AVAILABLE" || status === "PENDING_VALIDATION" || status === "CHARGING" || status === "CHARGING_COMPLETE"
          ? status
          : "AVAILABLE",
      activeAlert:
        activeAlert === null || activeAlert === "UNAUTHORIZED_ALERT" || activeAlert === "OVERSTAY_ALERT"
          ? activeAlert
          : null,
      validationTimeLeft:
        typeof incoming.validationTimeLeft === "number" && incoming.validationTimeLeft >= 0
          ? incoming.validationTimeLeft
          : VALIDATION_SECONDS,
      chargingTimeLeft:
        typeof incoming.chargingTimeLeft === "number" && incoming.chargingTimeLeft >= 0
          ? incoming.chargingTimeLeft
          : CHARGING_SECONDS,
      overstayTimeLeft:
        typeof incoming.overstayTimeLeft === "number" && incoming.overstayTimeLeft >= 0
          ? incoming.overstayTimeLeft
          : OVERSTAY_SECONDS,
      validationActive: Boolean(incoming.validationActive),
      chargingActive: Boolean(incoming.chargingActive),
      overstayActive: Boolean(incoming.overstayActive),
      showAlertPopup: Boolean(incoming.showAlertPopup),
      ownerSessionId: typeof incoming.ownerSessionId === "string" ? incoming.ownerSessionId : null,
    };
  }

  return defaultStates;
}

function readPersistedBayStates(): Record<string, BayRuntimeState> {
  if (typeof window === "undefined") return createInitialBayStates();

  try {
    const raw = window.localStorage.getItem(BAY_STATES_STORAGE_KEY);
    if (!raw) return createInitialBayStates();
    return coercePersistedBayStates(JSON.parse(raw));
  } catch {
    return createInitialBayStates();
  }
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
    CHARGING_COMPLETE:  { label: "Charging Complete",  className: "szm-badge szm-badge--complete" },
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
  const [currentSessionId] = useState<string>(getSessionId);
  const [selectedBay, setSelectedBay] = useState<EVBay | null>(null);
  const [bayStates, setBayStates] = useState<Record<string, BayRuntimeState>>(readPersistedBayStates);

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
                chargingTimeLeft: CHARGING_SECONDS,
                overstayTimeLeft: 0,
                validationActive: false,
                chargingActive: false,
                overstayActive: false,
                showAlertPopup: true,
                ownerSessionId: null,
              };
            } else {
              nextState = {
                ...state,
                validationTimeLeft: nextValidationTimeLeft,
              };
            }
          } else if (state.chargingActive) {
            const nextChargingTimeLeft = state.chargingTimeLeft - 1;
            if (nextChargingTimeLeft <= 0) {
              nextState = {
                ...state,
                spotStatus: "CHARGING_COMPLETE",
                chargingTimeLeft: 0,
                chargingActive: false,
                overstayTimeLeft: OVERSTAY_SECONDS,
                overstayActive: true,
              };
            } else {
              nextState = {
                ...state,
                chargingTimeLeft: nextChargingTimeLeft,
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

  // Sync bay runtime states across browser sessions on the same origin.
  useEffect(() => {
    try {
      window.localStorage.setItem(BAY_STATES_STORAGE_KEY, JSON.stringify(bayStates));
    } catch {
      // Ignore persistence issues and keep in-memory runtime state working.
    }
  }, [bayStates]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== BAY_STATES_STORAGE_KEY || !event.newValue) return;
      try {
        setBayStates(coercePersistedBayStates(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed updates from external tabs.
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
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
      chargingTimeLeft: CHARGING_SECONDS,
      overstayTimeLeft: OVERSTAY_SECONDS,
      validationActive: true,
      chargingActive: false,
      overstayActive: false,
      ownerSessionId: currentSessionId,
    }));
  };

  const handleUserValidate = () => {
    if (
      !selectedBay ||
      selectedBayState?.spotStatus !== "PENDING_VALIDATION" ||
      selectedBayState.ownerSessionId !== currentSessionId
    ) {
      return;
    }
    updateBayState(selectedBay.id, (state) => ({
      ...state,
      spotStatus: "CHARGING",
      validationActive: false,
      chargingTimeLeft: CHARGING_SECONDS,
      chargingActive: true,
      overstayTimeLeft: OVERSTAY_SECONDS,
      overstayActive: false,
    }));
  };

  const handleSensorClear = () => {
    if (!selectedBay || !selectedBayState) return;
    if (selectedBayState.ownerSessionId !== null && selectedBayState.ownerSessionId !== currentSessionId) return;
    updateBayState(selectedBay.id, () => createBayRuntimeState());
  };

  // ── Derived ──
  const isOccupied = selectedBayState ? selectedBayState.spotStatus !== "AVAILABLE" : false;
  const selectedBayLockedByOtherUser =
    !!selectedBayState &&
    selectedBayState.spotStatus !== "AVAILABLE" &&
    selectedBayState.ownerSessionId !== currentSessionId;
  const canControlSelectedBay = !!selectedBayState && !selectedBayLockedByOtherUser;
  const showValTimer = selectedBayState?.spotStatus === "PENDING_VALIDATION";
  const showChargingTimer = selectedBayState?.spotStatus === "CHARGING" || selectedBayState?.chargingActive;
  const showOvTimer = selectedBayState?.spotStatus === "CHARGING_COMPLETE" || selectedBayState?.activeAlert === "OVERSTAY_ALERT";

  return (
    <div className="sp-page">
      {/* Header */}
      <div className="sp-header sp-header--rounded">
        <button className="sp-icon-btn--ghost" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="sp-header__title">EV Smart Zone</span>
        <div className="sp-spacer" />
      </div>

      <div className="sp-content">

        {/* ── Bay Selector ── */}
        <div className="sp-card szm-selector-card">
          <p className="szm-selector-title">Select EV Charging Bay</p>
          <div className="szm-bay-list">
            {EV_BAYS.map((bay) => {
              const state = bayStates[bay.id] ?? createBayRuntimeState();
              const isSelected = selectedBay?.id === bay.id;
              const isOccupied = state.spotStatus !== "AVAILABLE";
              const isLocked = isOccupied && state.ownerSessionId !== currentSessionId;

              return (
                <button
                  key={bay.id}
                  className={`szm-bay-btn ${isSelected ? "szm-bay-btn--active" : ""} ${isLocked ? "szm-bay-btn--occupied" : ""}`}
                  onClick={() => handleSelectBay(bay)}
                  disabled={isLocked}
                  title={isLocked ? `${bay.label} is occupied` : undefined}
                >
                  <span className="szm-bay-btn__icon">🔌</span>
                  <span className="szm-bay-btn__label">{bay.label}</span>
                  {isLocked ? (
                    <span className="szm-bay-btn__status">Occupied</span>
                  ) : (
                    <span className="szm-bay-btn__level">{bay.level}</span>
                  )}
                </button>
              );
            })}
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
                  {selectedBayState?.spotStatus === "CHARGING_COMPLETE" && "Charging Complete - Please Move Vehicle"}
                </p>
              </div>
            </div>

            {/* ── Timer Cards ── */}
            {(showValTimer || showChargingTimer || showOvTimer) && (
              <div className="szm-timer-row">
                {showValTimer && (
                  <div className={`szm-timer-card szm-timer-card--validation ${selectedBayState!.validationTimeLeft <= 30 ? "szm-timer-card--urgent" : ""}`}>
                    <p className="szm-timer-card__label">Validation Timer</p>
                    <p className="szm-timer-card__time">{formatTime(selectedBayState!.validationTimeLeft)}</p>
                    <p className="szm-timer-card__hint">Time to scan app</p>
                  </div>
                )}
                {showChargingTimer && (
                  <div className={`szm-timer-card szm-timer-card--charging ${selectedBayState!.chargingTimeLeft <= 10 ? "szm-timer-card--urgent" : ""}`}>
                    <p className="szm-timer-card__label">Charging Timer</p>
                    <p className="szm-timer-card__time">{formatTime(selectedBayState!.chargingTimeLeft)}</p>
                    <p className="szm-timer-card__hint">Estimated charging time left</p>
                  </div>
                )}
                {showOvTimer && (
                  <div className={`szm-timer-card szm-timer-card--overstay ${selectedBayState!.overstayTimeLeft <= 60 ? "szm-timer-card--urgent" : ""}`}>
                    <p className="szm-timer-card__label">Grace Period Timer</p>
                    <p className="szm-timer-card__time">{formatTime(selectedBayState!.overstayTimeLeft)}</p>
                    <p className="szm-timer-card__hint">Move vehicle before overstay alert</p>
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
                  disabled={!canControlSelectedBay || selectedBayState?.spotStatus !== "AVAILABLE"}
                >
                  <span className="szm-ctrl-btn__icon">🚗</span>
                  <span className="szm-ctrl-btn__label">Sensor: Car Parks</span>
                  <span className="szm-ctrl-btn__sub">isOccupied → true</span>
                </button>

                <button
                  className="szm-ctrl-btn szm-ctrl-btn--validate"
                  onClick={handleUserValidate}
                  disabled={!canControlSelectedBay || selectedBayState?.spotStatus !== "PENDING_VALIDATION"}
                >
                  <span className="szm-ctrl-btn__icon">📱</span>
                  <span className="szm-ctrl-btn__label">User Scan QR Code</span>
                  <span className="szm-ctrl-btn__sub">EV ownership confirmed</span>
                </button>

                <button
                  className="szm-ctrl-btn szm-ctrl-btn--clear"
                  onClick={handleSensorClear}
                  disabled={!canControlSelectedBay || (!isOccupied && selectedBayState?.activeAlert === null)}
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
            ? "Vehicle has not validated EV ownership within 3 minutes. Security staff has been notified."
            : "Vehicle has exceeded the 2-hour EV charging limit. Idle fees has been applied."
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