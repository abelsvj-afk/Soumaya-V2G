import { useEffect, useState } from "react";
import { getAgentLogs, getSettings, updateSetting, type AgentLog } from "../api/client.js";

interface DailyLog {
  id: number;
  content: string;
  date: string;
}

export function SoumayaPanel({ onFocus }: { onFocus: (id: number) => void }) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [logsData, settings] = await Promise.all([getAgentLogs(), getSettings()]);
      setLogs(logsData);
      setResearchEnabled(settings.research_enabled === "true");
      // Fetch daily log (just a simple fetch inline for now)
      const res = await fetch("/api/maintenance/daily-log");
      if (res.ok) {
        const dl = await res.json();
        setDailyLog(dl);
      }
    } catch (err) {
      console.error("Failed to fetch Soumaya data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000); // refresh logs every 10s
    return () => clearInterval(timer);
  }, []);

  const toggleResearch = async () => {
    const newVal = !researchEnabled;
    setResearchEnabled(newVal);
    await updateSetting("research_enabled", String(newVal));
  };

  if (loading) return <div className="dock-body"><p className="empty">Initializing Soumaya link...</p></div>;

  return (
    <div className="dock-body">
      <div className="dock-head">
        <h3>Soumaya Command Center</h3>
        <div className="toggle-box">
          <span className="mini-label">Research Mode</span>
          <button 
            className={`mini ${researchEnabled ? 'active' : ''}`} 
            onClick={toggleResearch}
            style={{ 
              backgroundColor: researchEnabled ? 'rgba(100,200,255,0.2)' : 'transparent',
              borderColor: researchEnabled ? '#64c8ff' : 'rgba(255,255,255,0.2)'
            }}
          >
            {researchEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <p className="description" style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '1rem' }}>
        Autonomous agent for graph maintenance and knowledge expansion. Research consumes tokens.
      </p>

      {dailyLog && (
        <div className="daily-log" style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(100, 200, 255, 0.05)', borderLeft: '3px solid rgba(100, 200, 255, 0.5)', borderRadius: '0 4px 4px 0' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'rgba(100, 200, 255, 0.9)' }}>Captain's Log ({dailyLog.date})</h4>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4, opacity: 0.9 }}>{dailyLog.content}</p>
        </div>
      )}

      <div className="log-container">
        <h4>Recent Activity</h4>
        {logs.length === 0 && <p className="empty">No recent logs recorded.</p>}
        <ul className="agent-logs" style={{ listStyle: 'none', padding: 0 }}>
          {logs.map((log) => {
            let targets: number[] = [];
            try {
              const parsed = JSON.parse(log.targets);
              if (Array.isArray(parsed)) targets = parsed;
            } catch {
              /* ignore malformed targets */
            }
            return (
              <li key={log.id} style={{ 
                marginBottom: '0.8rem', 
                padding: '0.6rem', 
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: '4px',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6, fontSize: '0.7rem' }}>
                  <span style={{ textTransform: 'uppercase' }}>{log.action}</span>
                  <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
                <p style={{ margin: '0.3rem 0' }}>{log.description}</p>
                <div className="pills">
                  {targets.map((id) => (
                    <button
                      key={id}
                      className="pill mini"
                      onClick={() => onFocus(id)}
                    >
                      Node #{id}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
