import { useState, useEffect, useRef, useCallback } from "react";
import {
  db,
  ref as dbRef,
  set as dbSet,
  update as dbUpdate,
  onChildAdded,
  onChildChanged,
  off,
} from "../firebase/client";
import "./SmartParking.css";
import "./Parking.css";

export type SpotState = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "FULL";

export type ReservationStatus =
  | "IDLE"
  | "CHECKING"
  | "FULL"
  | "RESERVED"
  | "OCCUPIED"
  | "EXPIRED"
  | "LEFT";

export type SpotStatus = "available" | "occupied" | "reserved" | "disabled";

export interface HookParkingSpot {
  id: string;
  state: SpotState;
}

export interface MapParkingSpot {
  id: string;
  code: string;
  status: SpotStatus;
  level: number;
}

interface ReservationResult {
  status: ReservationStatus;
  spot: HookParkingSpot | null;
  timeLeft: number;
  totalTime: number;
  reserveSpot: (spotId: string) => void;
  simulateSensor: () => void;
  simulateLeave: () => void;
  reset: () => void;
}

//----------------------------------------

const TIMER_DURATION = 5; // 10 minutes

const SMART_LETTER_COLORS = ["#E53935", "#F57C00", "#F9A825", "#388E3C", "#1565C0"];

const CAR_COLORS: Record<SpotStatus, string> = {
  occupied:  "#E53935",
  reserved:  "#F57C00",
  available: "transparent",
  disabled:  "transparent",
};

const SPOT_BG: Record<SpotStatus, string> = {
  available: "#2E7D32",
  occupied:  "#B71C1C",
  reserved:  "#E65100",
  disabled:  "#37474F",
};

//----------------------------------------

function createSpotDatabase(): HookParkingSpot[] {
  const rows = ["A", "B", "C", "D"];
  const spots: HookParkingSpot[] = [];
  rows.forEach((row) => {
    for (let col = 1; col <= 6; col++) {
      spots.push({ id: `L1-${row}${col}`, state: "AVAILABLE" });
    }
  });
  return spots;
}

function useReservation(): ReservationResult {
  const [spots,        setSpots]        = useState<HookParkingSpot[]>(createSpotDatabase());
  const [status,       setStatus]       = useState<ReservationStatus>("IDLE");
  const [reservedSpot, setReservedSpot] = useState<HookParkingSpot | null>(null);
  const [timeLeft,     setTimeLeft]     = useState(TIMER_DURATION);

  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const spotRef           = useRef<HookParkingSpot | null>(null);
  const tokenRef          = useRef<string | null>(null);
  const requestPendingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { 
      clearInterval(timerRef.current); 
      timerRef.current = null; }
  }, []);

  useEffect(() => () => { clearTimer(); }, [clearTimer]);

  //-----------------------------------------------

  useEffect(() => {
    const reservationsRef = dbRef(db, "reservations");

    const handleAdded = (snap: any) => {
      const p = snap.val();
      if (!p) return;
      const { token, status, spotId } = { token: p.token, status: p.status, spotId: p.spotId || p.bay || null };

      try {
        window.dispatchEvent(new CustomEvent("smartparking:reservation", {
          detail: { action: status === "RESERVED" ? "reserved" : status === "OCCUPIED" ? "occupied" : status === "EXPIRED" ? "expired" : "reset", token, zone: p.zone, spotId },
        }));
      } catch (_) {}
      if (requestPendingRef.current && status === "RESERVED") {
        requestPendingRef.current = false;
        tokenRef.current = token;
        const spot: HookParkingSpot = { id: spotId ?? "", state: "RESERVED" };
        spotRef.current = spot;
        setReservedSpot(spot);
        setTimeLeft(Math.max(0, Math.floor((p.expiresAt - Date.now()) / 1000)));
        setStatus("RESERVED");
      }
    };

    const handleChanged = (snap: any) => {
      const p = snap.val();
      if (!p) return;
      const { token, status, spotId } = { token: p.token, status: p.status, spotId: p.spotId || p.bay || null };

      try {
        window.dispatchEvent(new CustomEvent("smartparking:reservation", {
          detail: { action: status === "RESERVED" ? "reserved" : status === "OCCUPIED" ? "occupied" : status === "EXPIRED" ? "expired" : "reset", token, zone: p.zone, spotId },
        }));
      } catch (_) {}

      if (token && tokenRef.current === token) {
        if (status === "OCCUPIED") { 
          clearTimer(); 
          setStatus("OCCUPIED"); 
        }
        else if (status === "EXPIRED") { 
          clearTimer(); 
          setStatus("EXPIRED"); 
          tokenRef.current = null; 
          setReservedSpot(null); 
        }
        else if (status === "RESET")   { 
          clearTimer(); 
          setStatus("IDLE");   
          tokenRef.current = null; 
          setReservedSpot(null); 
        }
      }
    };

    onChildAdded(reservationsRef, handleAdded as any);
    onChildChanged(reservationsRef, handleChanged as any);
    return () => { try { off(reservationsRef); } catch (_) {} };
  }, [clearTimer]);

  //-----------------------------------------------expired parrking timer countdown

  useEffect(() => {
    if (status !== "RESERVED") {
      return; }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          setStatus("EXPIRED");
          const expiredToken = tokenRef.current;
          if (spotRef.current) {
            setSpots((s) => s.map((sp) => sp.id === spotRef.current?.id ? { ...sp, state: "AVAILABLE" } : sp));
          }
          try {
            window.dispatchEvent(new CustomEvent("smartparking:reservation", {
              detail: { 
                action: "expired", 
                token: expiredToken},
            })); } catch (_) {}
          if (expiredToken) {
            dbUpdate(dbRef(db, `reservations/${expiredToken}`), { 
              status: "EXPIRED" 
            }).catch(() => {});
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimer();
  }, [status, clearTimer]);

  //-----------------------------------------------

    const reserveSpot = useCallback(async (spotId: string) => {

    const available = spots.find((s) => s.id === spotId && s.state === "AVAILABLE");
    if (!available) {
      setStatus("FULL");
      requestPendingRef.current = false;
      return;
    }

    const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const reserved: HookParkingSpot = { ...available, state: "RESERVED" };

    try {
      tokenRef.current = token; 
      spotRef.current = reserved;
      setSpots((prev) => prev.map((sp) => sp.id === available.id ? reserved : sp));
      setReservedSpot(reserved);
      setTimeLeft(TIMER_DURATION);
      setStatus("RESERVED");

      window.dispatchEvent(new CustomEvent("smartparking:reservation", { 
        detail: { 
          action: "reserved", 
          token, 
          spotId: reserved.id } 
      }));

      await dbSet(dbRef(db, `reservations/${token}`), {
        token,
        spotId: reserved.id,
        status: "RESERVED",
        expiresAt: Date.now() + TIMER_DURATION * 1000,
      });

    } finally {
      requestPendingRef.current = false;
     }
  }, [spots]);

  //---------------------------------------------------------------simulate sensor trigger car is parked

  const simulateSensor = useCallback(async () => {
    const currentSpotId = spotRef.current?.id;
    const currentToken  = tokenRef.current;

    if (!currentSpotId) 
      return;

    clearTimer();

    setStatus((prev) => { 
      if (prev !== "RESERVED"){
        console.warn("[simulateSensor] unexpected status:", prev);}
      return "OCCUPIED"; });

    setSpots((s) => s.map((sp) => sp.id === currentSpotId ? { ...sp, state: "OCCUPIED" } : sp));

    try { 
      window.dispatchEvent(new CustomEvent("smartparking:reservation", { 
        detail: { 
          action: "occupied", 
          token: currentToken, 
          spotId: currentSpotId } })); 
        } catch (_) {}

    if (currentToken) { 
      try { 
        await dbUpdate(dbRef(db, `reservations/${currentToken}`), 
        { status: "OCCUPIED" }); 
      } catch (_) {} 
    }
  }, [clearTimer]);

  //---------------------------------------------------------------simulate car leaving the spot

  const simulateLeave = useCallback(async () => {
    const currentSpotId = spotRef.current?.id;
    const currentToken  = tokenRef.current;
    if (!currentSpotId) { 
      console.warn("[simulateLeave] no spotRef, aborting"); 
      return; }
    setStatus(() => "LEFT");
    setSpots((s) => s.map((sp) => sp.id === currentSpotId ? { ...sp, state: "AVAILABLE" } : sp));
    try { 
      window.dispatchEvent(new CustomEvent("smartparking:reservation", { 
        detail: { 
          action: "left", 
          token: currentToken, 
          spotId: currentSpotId } })); 
        } catch (_) {}
    if (currentToken) { 
      try { 
        await dbUpdate(dbRef(db, `reservations/${currentToken}`), 
        { status: "LEFT" }); 
      } catch (_) {} }
  }, []);

  //---------------------------------------------------------------

  const reset = useCallback(async () => {
    clearTimer();
    setStatus("IDLE"); setReservedSpot(null); setTimeLeft(TIMER_DURATION); spotRef.current = null;
    if (tokenRef.current) {
      try { await dbUpdate(dbRef(db, `reservations/${tokenRef.current}`), { status: "RESET" }); }
      catch (_) { try { window.dispatchEvent(new CustomEvent("smartparking:reservation", { detail: { action: "reset", token: tokenRef.current } })); } catch (_) {} }
    }
    setSpots(createSpotDatabase()); tokenRef.current = null;
  }, [clearTimer]);

  return { status, spot: reservedSpot, timeLeft, totalTime: TIMER_DURATION, reserveSpot, simulateSensor, simulateLeave, reset };
}

//----------------------------------------

function TimerRing({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress  = timeLeft / totalTime;
  const dashOffset = circumference * (1 - progress);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const label = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const color = progress > 0.5 ? "#E53935" : progress > 0.25 ? "#F57C00" : "#B71C1C";
  return (
    <div className="rf-timer-ring">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#f0f0f0" strokeWidth="8" />
        <circle cx="64" cy="64" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform="rotate(-90 64 64)"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
        />
      </svg>
      <div className="rf-timer-ring__label" style={{ color }}>{label}</div>
    </div>
  );
}

function DetailCard({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rf-detail-card">
      {rows.map(([label, val]) => (
        <div key={label} className="sp-confirm-row">
          <span className="sp-confirm-row__label">{label}</span>
          <span className="sp-confirm-row__value">{val}</span>
        </div>
      ))}
    </div>
  );
}

function spotDetailRows(spot: HookParkingSpot, vehicle: string, extra?: [string, string][]): [string, string][] {
  return [
    ["Level", "1"],
    ["Spot ID", spot.id ?? "-"],
    ["Vehicle", vehicle],
    ...(extra ?? []),
  ];
}

function ReservationFlow({
  status, spot, timeLeft, totalTime, vehicle, onSimulateSensor, onSimulateLeave, onReset,
}: {
  status: ReservationStatus;
  spot: HookParkingSpot | null;
  timeLeft: number;
  totalTime: number;
  vehicle: string;
  onSimulateSensor: () => void;
  onSimulateLeave: () => void;
  onReset: () => void;
}) {
  if (status === "CHECKING") return null;

  if (status === "FULL") return (
    <div className="rf-screen">
      <div className="rf-icon rf-icon--danger">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#B71C1C" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="rf-screen__title">Parking Full</h2>
      <p className="rf-screen__sub">No available bays in the selected zone. Try a different zone or check back later.</p>
      <button className="sp-btn sp-btn--primary rf-cta" onClick={onReset}>Try Another Zone</button>
    </div>
  );

  if (status === "RESERVED" && spot) return (
    <div className="rf-screen">
      <div className="rf-badge rf-badge--reserved">Bay Reserved</div>
      <TimerRing timeLeft={timeLeft} totalTime={totalTime} />
      <p className="rf-screen__sub" style={{ marginTop: 12 }}>Drive to your bay before the timer runs out</p>
      <DetailCard rows={spotDetailRows(spot, vehicle)} />
      <button className="rf-sensor-btn" onClick={onSimulateSensor}>⚡ Simulate Sensor Trigger (dev)</button>
    </div>
  );

  if (status === "OCCUPIED") return (
    <div className="rf-screen">
      <div className="rf-icon rf-icon--success">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="rf-screen__title">You're parked!</h2>
      <p className="rf-screen__sub">Sensor confirmed your arrival. Enjoy your visit.</p>
      {spot && <DetailCard rows={spotDetailRows(spot, vehicle, [["Status", "Occupied"]])} />}
      <button className="rf-sensor-btn" style={{ marginTop: 8 }} onClick={onSimulateLeave}>⚡ Simulate Sensor Leave (dev)</button>
    </div>
  );

  if (status === "LEFT") return (
    <div className="rf-screen">
      <div className="rf-icon" style={{ background: "#E3F2FD" }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1565C0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </div>
      <h2 className="rf-screen__title">See you next time!</h2>
      <p className="rf-screen__sub">Your spot has been released. Drive safe!</p>
      <button className="sp-btn sp-btn--primary rf-cta" onClick={onReset} style={{ padding: "8px 0" }}>Done</button>
    </div>
  );

  if (status === "EXPIRED") return (
    <div className="rf-screen">
      <div className="rf-icon rf-icon--warning">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#E65100" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h2 className="rf-screen__title">Reservation Expired</h2>
      <p className="rf-screen__sub">The timer has passed. Your bay has been released back to the pool.</p>
      <button className="sp-btn sp-btn--primary rf-cta" onClick={onReset}>Reserve Again</button>
    </div>
  );

  return null;
}

function generateMapSpots(level: number): MapParkingSpot[] {
  const rows = ["A", "B", "C", "D"];
  const spots: MapParkingSpot[] = [];
  rows.forEach((row) => {
    for (let col = 1; col <= 6; col++) {
      const key = `${row}${col}`;
      const code = `L${level}-${row}${col}`;
      let status: SpotStatus = "available";
      if (row === "A" && col === 1 && level === 1) status = "disabled";
      spots.push({ id: `L${level}-${key}`, code, status, level });
    }
  });
  return spots;
}

const INITIAL_MAP_SPOTS: MapParkingSpot[] = [
  ...generateMapSpots(1),
];

function CarTopDown({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 36 60" className="pm-car-svg" aria-hidden="true">
      <rect x="4"  y="8"  width="28" height="44" rx="6" fill={color} />
      <rect x="8"  y="12" width="20" height="12" rx="3" fill="rgba(255,255,255,0.35)" />
      <rect x="8"  y="36" width="20" height="10" rx="3" fill="rgba(255,255,255,0.25)" />
      <rect x="0"  y="10" width="5"  height="10" rx="2" fill="#1a1a1a" />
      <rect x="0"  y="40" width="5"  height="10" rx="2" fill="#1a1a1a" />
      <rect x="31" y="10" width="5"  height="10" rx="2" fill="#1a1a1a" />
      <rect x="31" y="40" width="5"  height="10" rx="2" fill="#1a1a1a" />
      <rect x="7"  y="8"  width="8"  height="4"  rx="1" fill="#FFF9C4" opacity="0.9" />
      <rect x="21" y="8"  width="8"  height="4"  rx="1" fill="#FFF9C4" opacity="0.9" />
      <rect x="7"  y="50" width="8"  height="3"  rx="1" fill="#EF9A9A" opacity="0.9" />
      <rect x="21" y="50" width="8"  height="3"  rx="1" fill="#EF9A9A" opacity="0.9" />
    </svg>
  );
}

function SpotCell({ spot, onClick }: { spot: MapParkingSpot; onClick: (s: MapParkingSpot) => void }) {
  const isClickable = spot.status === "available";
  return (
    <div
      className={`pm-spot pm-spot--${spot.status}`}
      style={{ background: SPOT_BG[spot.status] }}
      onClick={() => isClickable && onClick(spot)}
      title={`${spot.code} — ${spot.status}`}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : -1}
      onKeyDown={(e) => e.key === "Enter" && isClickable && onClick(spot)}
    >
      {spot.status === "disabled" ? (
        <span className="pm-spot__wheelchair">♿</span>
      ) : spot.status !== "available" ? (
        <CarTopDown color={CAR_COLORS[spot.status]} />
      ) : null}
      <span className="pm-spot__code">{spot.code.split("-")[1]}</span>
    </div>
  );
}

function MapLegend() {
  const items: { status: SpotStatus; label: string }[] = [
    { status: "available", label: "Available" },
    { status: "occupied",  label: "Occupied"  },
    { status: "reserved",  label: "Reserved"  },
    { status: "disabled",  label: "Disabled"  },
  ];
  return (
    <div className="pm-legend">
      {items.map(({ status, label }) => (
        <div key={status} className="pm-legend__item">
          <div className="pm-legend__dot" style={{ background: SPOT_BG[status] }} />
          <span className="pm-legend__label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function LevelView({ level, spots, onSpotClick }: { level: number; spots: MapParkingSpot[]; onSpotClick: (s: MapParkingSpot) => void }) {
  const rows = ["A", "B", "C", "D"];
  const cols = 6;
  const available = spots.filter((s) => s.status === "available").length;
  const total     = spots.filter((s) => s.status !== "disabled").length;
  return (
    <div className="pm-level">
      <div className="pm-level__header">
        <div className="pm-level__title">
          <span className="pm-level__badge">Level {level}</span>
          <span className="pm-level__count">
            <span className="pm-level__count-avail">{available}</span>
            <span className="pm-level__count-sep"> / </span>{total} available
          </span>
        </div>
        <div className="pm-level__bar">
          <div className="pm-level__bar-fill" style={{ width: `${(available / total) * 100}%` }} />
        </div>
      </div>
      <div className="pm-grid-wrap">
        <div className="pm-row-labels">
          {rows.map((r) => <div key={r} className="pm-row-label">{r}</div>)}
        </div>
        <div className="pm-grid">
          <div className="pm-grid__half">
            {rows.slice(0, 2).map((row) => (
              <div key={row} className="pm-grid__row">
                {Array.from({ length: cols }, (_, i) => {
                  const spot = spots.find((s) => s.id === `L${level}-${row}${i + 1}`)!;
                  return <SpotCell key={spot.id} spot={spot} onClick={onSpotClick} />;
                })}
              </div>
            ))}
          </div>
          <div className="pm-lane">
            <div className="pm-lane__dashes" />
            <span className="pm-lane__arrow">▶</span>
            <span className="pm-lane__arrow pm-lane__arrow--r">◀</span>
          </div>
          <div className="pm-grid__half pm-grid__half--flip">
            {rows.slice(2).map((row) => (
              <div key={row} className="pm-grid__row">
                {Array.from({ length: cols }, (_, i) => {
                  const spot = spots.find((s) => s.id === `L${level}-${row}${i + 1}`)!;
                  return <SpotCell key={spot.id} spot={spot} onClick={onSpotClick} />;
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="pm-col-labels">
          {Array.from({ length: cols }, (_, i) => <div key={i} className="pm-col-label">{i + 1}</div>)}
        </div>
      </div>
    </div>
  );
}

function ReserveSheet({ spot, onClose, onConfirm }: {
  spot: MapParkingSpot;
  onClose: () => void;
  onConfirm: (vehicle: string) => void;
}) {
  const [vehicle,  setVehicle]  = useState("");
  return (
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal pm-modal--reserve" onClick={(e) => e.stopPropagation()}>
        <div className="pm-modal__handle" />
        <div className="pm-reserve__spot-badge">
          <div className="pm-reserve__spot-dot" />
          <span className="pm-reserve__spot-code">{spot.code}</span>
          <span className="pm-reserve__spot-avail">Available</span>
        </div>
        <h3 className="pm-modal__title">Reserve this spot?</h3>
        <p className="pm-modal__meta">
          Level {spot.level} · Row {spot.code.split("-")[1][0]} · Bay {spot.code.split("-")[1].slice(1)}
        </p>
        <div className="pm-reserve__field">
          <label className="pm-reserve__label">Vehicle Number</label>
          <input
            type="text"
            className="pm-reserve__input"
            placeholder="Enter vehicle number"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value.toUpperCase())}
          />
        </div>
        <div className="pm-reserve__timer-note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F57C00" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span>You'll have <strong>10 minutes</strong> to reach your spot after confirming.</span>
        </div>
        <div className="pm-reserve__actions">
          <button className="pm-reserve__btn pm-reserve__btn--cancel" onClick={onClose}>Cancel</button>
          <button className="pm-reserve__btn pm-reserve__btn--confirm" onClick={() => onConfirm(vehicle)}>
            Confirm Reservation
          </button>
        </div>
      </div>
    </div>
  );
}

function ParkingMap({ onSelect }: { onSelect?: (spot: MapParkingSpot) => void }) {
  const [spots,         setSpots]         = useState<MapParkingSpot[]>(INITIAL_MAP_SPOTS);
  //const [activeLevel,   setActiveLevel]   = useState(1);
  const [reserveTarget, setReserveTarget] = useState<MapParkingSpot | null>(null);
  const [reservedVehicle, setReservedVehicle] = useState("");
  const reservationMapRef = useRef<Record<string, string>>({});

  const { status, spot, timeLeft, totalTime, reserveSpot, simulateSensor, simulateLeave, reset } = useReservation();
  const showFlow = status !== "IDLE";

  useEffect(() => {
    function handler(e: Event) {
      const { action, token, zone, spotId } =
        (e as CustomEvent<{ action: string; token?: string | null; zone?: string; spotId?: string | null }>).detail ?? {};
      if (!action) return;

      if (spotId) {
        if (action === "reserved") {
          setSpots((p) => p.map((s) => s.id === spotId ? { ...s, status: "reserved" } : s));
          if (token) reservationMapRef.current[token] = spotId;
        } else if (action === "occupied") {
          setSpots((p) => p.map((s) => s.id === spotId ? { ...s, status: "occupied" } : s));
        } else if (["expired", "reset", "left"].includes(action)) {
          setSpots((p) => p.map((s) => s.id === spotId ? { ...s, status: "available" } : s));
          if (token) delete reservationMapRef.current[token];
        }
        return;
      }

      if (!token) return;
      if (action === "reserved") {
        const m = zone?.match(/Level\s*(\d+)/i);
        const level = m ? Number(m[1]) : null;
        if (level !== null) {
          setSpots((prev) => {
            const idx = prev.findIndex((s) => s.level === level && s.status === "available");
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], status: "reserved" };
            reservationMapRef.current[token] = updated[idx].id;
            return updated;
          });
        }
        return;
      }
      const mappedId = reservationMapRef.current[token];
      if (action === "occupied" && mappedId) {
        setSpots((p) => p.map((s) => s.id === mappedId ? { ...s, status: "occupied" } : s));
      } else if (["expired", "reset", "left"].includes(action) && mappedId) {
        setSpots((p) => p.map((s) => s.id === mappedId ? { ...s, status: "available" } : s));
        delete reservationMapRef.current[token];
      }
    }
    window.addEventListener("smartparking:reservation", handler);
    return () => window.removeEventListener("smartparking:reservation", handler);
  }, []);

  const levelSpots = spots;
  const totalAvail = spots.filter((s) => s.status === "available").length;
  const totalSpots = spots.filter((s) => s.status !== "disabled").length;

  const handleSpotClick = (clicked: MapParkingSpot) => {
    if (clicked.status !== "available") return;
    if (onSelect) { onSelect(clicked); return; }
    setReserveTarget(clicked);
  };

  const handleConfirm = (vehicle: string) => {
    if (!reserveTarget) return;
    setReservedVehicle(vehicle);
    setReserveTarget(null);
    reserveSpot(reserveTarget.id);
  };

  const handleReset = () => {
    setSpots(INITIAL_MAP_SPOTS);
    reservationMapRef.current = {};
    reset();
  };

  return (
    <div className="pm-root">
      <div className="pm-topbar">
        <div className="pm-topbar__logo">
          <span style={{ color: "#E53935", fontWeight: 800, fontSize: 13, letterSpacing: 2 }}>SUNWAY</span>
          <span style={{ fontWeight: 900, fontSize: 17, color: "#f0f0f0", letterSpacing: 3, marginLeft: 6 }}>PARKING</span>
        </div>
        <div className="pm-topbar__summary">
          <span className="pm-topbar__avail">{totalAvail}</span>
          <span className="pm-topbar__avail-label"> / {totalSpots} free</span>
        </div>
      </div>

      <div className="pm-level-tabs">
  <button className="pm-level-tab pm-level-tab--active">
    <span className="pm-level-tab__name">Level 1</span>
    <span className="pm-level-tab__count">
      {spots.filter((s) => s.status === "available").length} free
    </span>
  </button>
</div>

      <div className="pm-body">
        <LevelView 
        level={1} 
        spots={levelSpots} 
        onSpotClick={handleSpotClick} />
        <MapLegend />
      </div>

      {reserveTarget && !onSelect && (
        <ReserveSheet spot={reserveTarget} onClose={() => setReserveTarget(null)} onConfirm={handleConfirm} />
      )}

      {showFlow && (
        <div className="pm-reservation-overlay">
          <div className="pm-res-header">
            <span style={{ color: "#E53935", fontWeight: 800, fontSize: 12, letterSpacing: 2 }}>SUNWAY</span>
            <span style={{ fontWeight: 900, fontSize: 15, color: "#fff", letterSpacing: 2, marginLeft: 6 }}>SMART PARKING</span>
          </div>
          <ReservationFlow
            status={status} spot={spot} timeLeft={timeLeft} totalTime={totalTime}
            vehicle={reservedVehicle} onSimulateSensor={simulateSensor}
            onSimulateLeave={simulateLeave} onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

interface ReservedParkingProps {
  onNoticeClick: () => void;
}

export default function ReservedParking({ }: ReservedParkingProps) {
  const [vehicle, setVehicle] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [vehicleWarning, setVehicleWarning] = useState(false);

  const { status, spot, timeLeft, totalTime, reserveSpot, simulateSensor, simulateLeave, reset } = useReservation();
  const showFlow = status !== "IDLE";

  const handleReset = () => reset();

  const handleMapSelect = (selected: MapParkingSpot) => {
    setShowMap(false);
    reserveSpot(selected.id);
  };

  return (
    <div className="sp-page">
      {/* Header */}
      <div className="sp-header sp-header--extended">
        <button className="sp-icon-btn" onClick={showFlow ? handleReset : undefined}>
          <BackIcon />
        </button>
        <span className="sp-header__title">Smart Parking</span>
        <div className="sp-header__actions">
          <button className="sp-icon-btn"><ReceiptIcon /></button>
          <button className="sp-icon-btn"><HelpIcon /></button>
        </div>
      </div>

      <div className="sp-logo-card">
        <div className="sp-logo-card__brand">
          <span className="sp-logo-card__brand-name">SUNWAY</span>
          <span className="sp-logo-card__brand-reg">®</span>
        </div>
        <div className="sp-logo-card__smart">
          {"SMART".split("").map((letter, i) => (
            <span key={i} className="sp-logo-card__smart-letter" style={{ color: SMART_LETTER_COLORS[i] }}>{letter}</span>
          ))}
        </div>
        <div className="sp-logo-card__parking">PARKING</div>
        <div className="sp-logo-card__taglines">
          {["HASSLE FREE", "CONVENIENT", "MULTI-PAYMENT"].map((t) => (
            <span key={t} className="sp-logo-card__tagline">• {t}</span>
          ))}
        </div>
      </div>

      {showFlow ? (
        <div className="sp-content">
          <div className="sp-card">
            <ReservationFlow
              status={status} spot={spot} timeLeft={timeLeft} totalTime={totalTime}
              vehicle={vehicle} onSimulateSensor={simulateSensor}
              onSimulateLeave={simulateLeave} onReset={handleReset}
            />
          </div>
        </div>
      ) : (
        <div className="sp-content">
          <div className="sp-card">
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 20px", textAlign: "center" }}>
              Parking Reservation
            </h2>
            <div className="sp-form-group">
              <label className="sp-label">Vehicle Number</label>
              <input
                type="text" className="sp-input" placeholder="Enter vehicle number"
                value={vehicle}
                onChange={(e) => { const v = e.target.value.toUpperCase(); setVehicle(v); if (v.trim()) setVehicleWarning(false); }}
              />
              {vehicleWarning && (
                <div style={{ color: "#B71C1C", fontSize: 13, marginTop: 8 }}>
                  Please enter your vehicle number before choosing a spot.
                </div>
              )}
            </div>
            <div className="sp-form-group" style={{ textAlign: "center", margin: "18px 0" }}>
              <button
                className="sp-btn sp-btn--primary"
                style={{ display: "inline-block" }}
                onClick={() => { 
                  if (!vehicle.trim()) { 
                    setVehicleWarning(true); 
                    return; 
                  } 
                  setShowMap(true); 
                }}
              >
                Choose on map
              </button>
            </div>
          </div>
        </div>
      )}

      {showMap && (
        <div className="sp-map-modal-overlay">
          <div className="sp-map-modal-content">
            <div className="sp-map-modal-header">
              <h2>Select a Parking Spot</h2>
              <button 
                className="sp-map-modal-close"
                onClick={() => setShowMap(false)}
              >
                ×
              </button>
            </div>
            <div className="sp-map-modal-body">
              <ParkingMap onSelect={handleMapSelect} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
