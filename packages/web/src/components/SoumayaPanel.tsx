import { useEffect, useState } from "react";
import type { Fuel } from "@brain/shared";
import {
  getAgentLogs,
  getDailyLog,
  getFuel,
  getSettings,
  updateSetting,
  getUsage,
  setBudget as apiSetBudget,
  resetUsage,
  getSpaceId,
  type AgentLog,
  type DailyLog,
  type Usage,
} from "../api/client.js";

export function SoumayaPanel({
  onFocus,
  showShipTask,
  setShowShipTask,
}: {
  onFocus: (id: number) => void;
  showShipTask?: boolean;
  setShowShipTask?: (v: boolean) => void;
}) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [fuel, setFuel] = useState<Fuel | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [logsData, settings, usageData, dl, fuelData] = await Promise.all([
        getAgentLogs(),
        getSettings(),
        getUsage(),
        getDailyLog(), // space-scoped via the client (sends x-space-id)
        getFuel(),
      ]);
      setLogs(logsData);
      setResearchEnabled(settings.research_enabled === "true");
      if (usageData) setUsage(usageData);
      if (dl) setDailyLog(dl);
      if (fuelData) setFuel(fuelData);
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

      {setShowShipTask && (
        <div className="toggle-box" style={{ marginBottom: '1rem' }}>
          <span className="mini-label">Show her current task above the ship</span>
          <button
            className={`mini ${showShipTask ? 'active' : ''}`}
            onClick={() => setShowShipTask(!showShipTask)}
            style={{
              backgroundColor: showShipTask ? 'rgba(100,200,255,0.2)' : 'transparent',
              borderColor: showShipTask ? '#64c8ff' : 'rgba(255,255,255,0.2)',
            }}
          >
            {showShipTask ? "ON" : "OFF"}
          </button>
        </div>
      )}

      {fuel && (
        <div className="budget-box">
          <div className="budget-head">
            <span>⛽ Fuel (earned by tending)</span>
            <span className={fuel.fuel < fuel.jobCost ? "budget-over" : ""}>
              {fuel.fuel.toFixed(1)} / {fuel.capacity}
            </span>
          </div>
          <div className="budget-bar">
            <div
              className="budget-fill"
              style={{
                width: `${Math.round(Math.min(1, fuel.fuel / fuel.capacity) * 100)}%`,
                background: fuel.fuel < fuel.jobCost ? "#ff6b6b" : "#8be9a0",
              }}
            />
          </div>
          <p className="budget-note">
            {fuel.fuel < fuel.jobCost
              ? "Out of fuel — her core duties (connections, tidying, daily log) still run; only deep-dive expansion pauses. Add memories, forge links, or clear action items to refuel."
              : "Powers Soumaya's ambitious deep-dive research + sector charting. Earn it by adding memories, forging links, and clearing action items."}
          </p>
        </div>
      )}

      {getSpaceId() && (
        <div className="budget-box">
          <div className="budget-head">
            <span>🛰️ Talk to me on Telegram</span>
          </div>
          <p className="budget-note">
            Message the bot, then connect this brain with your login:
          </p>
          <code
            className="brain-id"
            title="Tap to copy"
            onClick={() => navigator.clipboard?.writeText("/link <name> <passcode>")}
          >
            /link &lt;name&gt; &lt;passcode&gt;
          </code>
          <p className="budget-note">
            Use the same name + passcode you signed in with. After that I'll answer
            from this brain, log what you send, and bring you a daily digest.
          </p>
        </div>
      )}

      {usage && (
        <div className="budget-box">
          <div className="budget-head">
            <span>API budget (estimated)</span>
            <span className={usage.overBudget ? "budget-over" : usage.low ? "budget-low" : ""}>
              ${usage.estCostUsd.toFixed(3)} / ${usage.budgetUsd.toFixed(2)}
            </span>
          </div>
          <div className="budget-bar">
            <div
              className="budget-fill"
              style={{
                width: `${Math.round(usage.fractionUsed * 100)}%`,
                background: usage.overBudget ? "#ff6b6b" : usage.low ? "#ffd166" : "var(--accent)",
              }}
            />
          </div>
          {usage.overBudget ? (
            <p className="budget-note budget-over">
              Budget reached — AI is paused (offline mode). Recharge at platform.openai.com, then
              raise the budget or reset below.
            </p>
          ) : usage.low ? (
            <p className="budget-note budget-low">Running low — ~${usage.remainingUsd.toFixed(2)} left.</p>
          ) : (
            <p className="budget-note">
              ~${usage.remainingUsd.toFixed(2)} of estimated spend left. (Real balance can't be read
              from an API key — this is a token-based estimate.)
            </p>
          )}
          <div className="budget-actions">
            <input
              type="number"
              min={0}
              step={1}
              placeholder={`$${usage.budgetUsd}`}
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
            />
            <button
              className="mini"
              onClick={async () => {
                const v = Number(budgetInput);
                if (!Number.isFinite(v) || v < 0) return;
                const u = await apiSetBudget(v);
                if (u) setUsage(u);
                setBudgetInput("");
              }}
            >
              Set budget
            </button>
            <button
              className="mini"
              onClick={async () => {
                const u = await resetUsage();
                if (u) setUsage(u);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {dailyLog && (
        <div className="daily-log" style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(100, 200, 255, 0.05)', borderLeft: '3px solid rgba(100, 200, 255, 0.5)', borderRadius: '0 4px 4px 0' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'rgba(100, 200, 255, 0.9)' }}>Captain's Log ({dailyLog.date})</h4>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4, opacity: 0.9 }}>{dailyLog.content}</p>
        </div>
      )}

      {/* Consistency Constellation (Habit Grid) */}
      <div className="constellation-grid" style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>Consistency Constellation (Recent Activity)</h4>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {/* Mocking a 14-day trailing activity grid based on logs */}
          {Array.from({ length: 14 }).map((_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (13 - i));
            const dateStr = date.toISOString().split('T')[0]!;
            
            // Check if any log occurred on this day
            const hasActivity = logs.some(l => l.createdAt.startsWith(dateStr));
            
            return (
              <div 
                key={dateStr} 
                title={hasActivity ? `Activity on ${dateStr}` : `No activity on ${dateStr}`}
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '2px',
                  backgroundColor: hasActivity ? 'rgba(100, 200, 255, 0.8)' : 'rgba(255, 255, 255, 0.05)',
                  boxShadow: hasActivity ? '0 0 4px rgba(100, 200, 255, 0.5)' : 'none',
                  transition: 'background-color 0.3s'
                }}
              />
            );
          })}
        </div>
      </div>

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
            
            const rawDate = log.createdAt;
            const isoDate = rawDate.includes("Z") ? rawDate : rawDate.replace(" ", "T") + "Z";
            
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
                  <span>{new Date(isoDate).toLocaleTimeString()}</span>
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
