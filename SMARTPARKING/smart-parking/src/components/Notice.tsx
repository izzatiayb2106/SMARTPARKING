import { BackIcon } from "./icons";
import "./SmartParking.css";

interface NoticeItem {
  title: string;
  date: string;
  desc: string;
}

const NOTICES: NoticeItem[] = [
  {
    title: "Parking Rate Update",
    date: "17 Jun 2026",
    desc: "Effective 1 July 2026, parking rates for Zone B will be revised. Please check the updated rate card at all entrances.",
  },
  {
    title: "System Maintenance",
    date: "15 Jun 2026",
    desc: "Smart Parking payment systems will undergo scheduled maintenance on 20 Jun 2026, 2AM – 5AM. Cash payment remains available.",
  },
  {
    title: "New Zone C Opening",
    date: "10 Jun 2026",
    desc: "Zone C reserved parking is now open for registration. Limited bays available — register early to secure your spot.",
  },
];

interface NoticeProps {
  onBack: () => void;
}

export default function Notice({ onBack }: NoticeProps) {
  return (
    <div className="sp-page">
      <div className="sp-header sp-header--rounded">
        <button className="sp-icon-btn--ghost" onClick={onBack}>
          <BackIcon />
        </button>
        <span className="sp-header__title">Notices</span>
        <div className="sp-spacer" />
      </div>

      <div className="sp-notice-list">
        {NOTICES.map((item, i) => (
          <div key={i} className="sp-notice-item">
            <div className="sp-notice-item__header">
              <span className="sp-notice-item__title">{item.title}</span>
              <span className="sp-notice-item__date">{item.date}</span>
            </div>
            <p className="sp-notice-item__desc">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
