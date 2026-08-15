import { Database, Factory, LineChart, Lock, Plus } from "lucide-react";

export const metadata = {
  title: "Robo Portal",
  description: "Robo application portal for operations, reporting, and future internal systems.",
};

export default function PortalHome() {
  return (
    <main className="portal-shell">
      <section className="portal-hero">
        <div className="brand-block">
          <div className="logo-panel portal-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Robo Silicon" src="/robo-logo.png" />
          </div>
          <div>
            <p className="eyebrow">robo.rdcc.ai</p>
            <h1>Robo Application Portal</h1>
            <p className="subtitle">
              Central entry point for Robo Silicon operating systems and management reporting applications.
            </p>
          </div>
        </div>
      </section>

      <section className="portal-app-grid">
        <a className="portal-app-card active" href="/operations">
          <div className="portal-app-icon">
            <Factory size={24} />
          </div>
          <div>
            <h2>Robo Operations Reporting</h2>
            <p>Daily plant capture, validation, dashboards, locked snapshots, and PPT generation.</p>
          </div>
          <ul>
            <li><Database size={14} /> PostgreSQL-backed records</li>
            <li><LineChart size={14} /> Dashboard and trend review</li>
            <li><Lock size={14} /> Role-based plant access</li>
          </ul>
        </a>

        <div className="portal-app-card muted-card">
          <div className="portal-app-icon">
            <Plus size={24} />
          </div>
          <div>
            <h2>Future Robo Application</h2>
            <p>Reserved slot for the next Robo system.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
