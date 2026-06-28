import { useEffect, useState } from "react";
import { type Fuel } from "@brain/shared";
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
  type JobRationale,
  type Usage,
} from "../api/client.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SoumayaPanel({
  spaceName = "Soumaya",
  onFocus,
  onRecall,
  showShipTask,
  setShowShipTask,
  shipViewMode,
  setShipViewMode,
  tasks,
  onReorderTasks,
}: {
  spaceName?: string;
  onFocus: (id: number) => void;
  onRecall?: (ids: number[]) => void;
  showShipTask?: boolean;
  setShowShipTask?: (v: boolean) => void;
  shipViewMode?: "orbit" | "cockpit";
  setShipViewMode?: (v: "orbit" | "cockpit") => void;
  tasks?: any[];
  onReorderTasks?: (newOrder: any[]) => void;
}) {
  // Telemetry & Logs state
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [fuel, setFuel] = useState<Fuel | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);

  const moveTask = (index: number, direction: "up" | "down") => {
    if (!tasks || !onReorderTasks || !tasks[index]) return;
    const plannedTasks = tasks.filter((t) => t.status === "planned");
    const targetPlannedIndex = plannedTasks.findIndex(t => t.id === tasks[index]!.id);
    if (targetPlannedIndex === -1) return;
    
    const nextPlannedIndex = direction === "up" ? targetPlannedIndex - 1 : targetPlannedIndex + 1;
    if (nextPlannedIndex < 0 || nextPlannedIndex >= plannedTasks.length) return;
    
    const newPlanned = [...plannedTasks];
    const temp = newPlanned[targetPlannedIndex]!;
    newPlanned[targetPlannedIndex] = newPlanned[nextPlannedIndex]!;
    newPlanned[nextPlannedIndex] = temp;
    
    const doing = tasks.filter((t) => t.status === "doing");
    const done = tasks.filter((t) => t.status === "done");
    
    const newOrder = [...doing, ...newPlanned, ...done];
    onReorderTasks(newOrder);
  };

  // Fetch telemetry/logs
  const fetchData = async () => {
    try {
      const [logsData, settings, usageData, dl, fuelData] = await Promise.all([
        getAgentLogs(),
        getSettings(),
        getUsage(),
        getDailyLog(),
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


  if (loading) {
    return (
      <div className="dock-body">
        <p className="empty">Initializing {spaceName} link...</p>
      </div>
    );
  }

  return (
    <div className="dock-body">
      <div className="dock-head">
        <h3>{spaceName}</h3>
        <div className="head-tools">
          {setShipViewMode && (
            <button
              className={`link-btn ${shipViewMode === "cockpit" ? "active" : ""}`}
              title={shipViewMode === "cockpit" ? "Camera Mode: Cockpit Lock" : "Camera Mode: Orbit Follow"}
              onClick={() => setShipViewMode(shipViewMode === "cockpit" ? "orbit" : "cockpit")}
              style={{ fontSize: "1.1rem" }}
            >
              {shipViewMode === "cockpit" ? "🎥 Lock" : "🎥 Free"}
            </button>
          )}
          {setShowShipTask && (
            <button
              className={`link-btn ${showShipTask ? "active" : ""}`}
              title={showShipTask ? "Hide ship task label" : "Show ship task label"}
              onClick={() => setShowShipTask(!showShipTask)}
              style={{ fontSize: "1.1rem" }}
            >
              🏷️
            </button>
          )}
        </div>
      </div>

      {/* 1. Active Flight Tasks (At the top) */}
      <div className="ship-tasks-section" style={{ marginTop: "10px", paddingTop: "5px", borderTop: "none" }}>
        <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Active Flight Tasks
        </h4>
        {tasks && tasks.length > 0 ? (
          <ul className="ship-tasks-list">
            {tasks.map((task, idx) => {
              const isPlanned = task.status === "planned";
              const isDoing = task.status === "doing";
              const isDone = task.status === "done";
              
              const plannedTasks = tasks.filter((t) => t.status === "planned");
              const pIdx = plannedTasks.findIndex(t => t.id === task.id);
              
              return (
                <li key={task.id} className={`ship-task-item ${task.status}`}>
                  <span className={`status-indicator ${task.status}`}>
                    {isDoing && <span className="pulse-dot" />}
                    {isDone && "✓"}
                    {isPlanned && "○"}
                  </span>
                  <span className="task-label">{task.label}</span>
                  {isPlanned && (
                    <div className="task-controls">
                      <button
                        className="task-btn"
                        disabled={pIdx === 0}
                        onClick={() => moveTask(idx, "up")}
                        title="Move task up in priority"
                      >
                        ▲
                      </button>
                      <button
                        className="task-btn"
                        disabled={pIdx === plannedTasks.length - 1}
                        onClick={() => moveTask(idx, "down")}
                        title="Move task down in priority"
                      >
                        ▼
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty" style={{ margin: "5px 0", fontSize: "0.8rem", opacity: 0.6 }}>
            Idle at space station — no active flight tasks.
          </p>
        )}
      </div>

      {/* Operations & Telemetry */}
      <div className="operations-section" style={{ marginTop: "20px", borderTop: "1px solid var(--glass-border)", paddingTop: "15px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h4 style={{ margin: 0, fontSize: "13px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Operations & Telemetry
          </h4>
          <div className="toggle-box" style={{ margin: 0 }}>
            <span className="mini-label" style={{ fontSize: "11px", opacity: 0.7 }}>Research Mode</span>
            <button 
              className={`mini ${researchEnabled ? 'active' : ''}`} 
              onClick={toggleResearch}
              style={{ 
                backgroundColor: researchEnabled ? 'rgba(100,200,255,0.2)' : 'transparent',
                borderColor: researchEnabled ? '#64c8ff' : 'rgba(255,255,255,0.2)',
                fontSize: "10px",
                padding: "2px 6px"
              }}
            >
              {researchEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {fuel && (
          <div className="budget-box" style={{ marginTop: "10px" }}>
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
            <p className="budget-note" style={{ fontSize: "11px", marginTop: "6px" }}>
              {fuel.fuel < fuel.jobCost
                ? "Out of fuel — deep-dive expansion paused. Add memories, forge links, or clear action items to refuel."
                : "Powers deep-dive research + sector charting. Earn it by adding memories or forging links."}
            </p>
          </div>
        )}
      </div>

      {/* 4. Captain's Log */}
      {dailyLog && (
        <div className="daily-log" style={{ marginTop: "20px", padding: '1rem', backgroundColor: 'rgba(100, 200, 255, 0.05)', borderLeft: '3px solid rgba(100, 200, 255, 0.5)', borderRadius: '0 4px 4px 0' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'rgba(100, 200, 255, 0.9)', fontSize: "13px" }}>
            Captain's Log ({dailyLog.date})
          </h4>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4, opacity: 0.9 }}>{dailyLog.content}</p>
        </div>
      )}

      {/* 5. Consistency Constellation */}
      <div className="constellation-grid" style={{ marginTop: "20px", borderTop: "1px solid var(--glass-border)", paddingTop: "15px" }}>
        <h4 style={{ marginBottom: '8px', fontSize: '13px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Consistency Constellation
        </h4>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {Array.from({ length: 14 }).map((_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (13 - i));
            const dateStr = date.toISOString().split('T')[0]!;
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

      {/* 6. Recent Activity */}
      <div className="log-container" style={{ marginTop: "20px", borderTop: "1px solid var(--glass-border)", paddingTop: "15px" }}>
        <h4 style={{ marginBottom: "10px", fontSize: "13px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Recent Activity
        </h4>
        {logs.length === 0 && <p className="empty">No recent logs recorded.</p>}
        <ul className="agent-logs" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
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

            let rationale: JobRationale | null = null;
            try {
              if (log.result) {
                const r = JSON.parse(log.result);
                if (r && r.objective) rationale = r as JobRationale;
              }
            } catch {
              /* ignore malformed rationale */
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
                  <span>{new Date(isoDate).toLocaleTimeString()}</span>
                </div>
                <p style={{ margin: '0.3rem 0' }}>{log.description}</p>
                {rationale && (
                  <div
                    style={{
                      margin: '0.4rem 0',
                      padding: '0.45rem 0.55rem',
                      borderLeft: '2px solid rgba(100,200,255,0.5)',
                      background: 'rgba(100,200,255,0.06)',
                      borderRadius: '3px',
                      fontSize: '0.78rem',
                      lineHeight: 1.45,
                    }}
                  >
                    <div><span style={{ opacity: 0.55 }}>Objective · </span>{rationale.objective}</div>
                    <div><span style={{ opacity: 0.55 }}>Why now · </span>{rationale.why}</div>
                    <div><span style={{ opacity: 0.55 }}>Benefit · </span>{rationale.benefit}</div>
                  </div>
                )}
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

      {/* 7. Expandable Advanced Settings (Telegram Bot + API Budget) */}
      <details className="advanced-settings" style={{ marginTop: "20px", borderTop: "1px solid var(--glass-border)", paddingTop: "12px" }}>
        <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0" }}>
          Advanced connection & budget
        </summary>
        <div style={{ padding: "10px 0 0 0" }}>
          {getSpaceId() && (
            <div className="budget-box" style={{ marginBottom: "14px" }}>
              <div className="budget-head">
                <span>🛰️ Talk to me on Telegram</span>
              </div>
              <p className="budget-note" style={{ fontSize: "11px" }}>
                Message the bot, then connect this brain with your login:
              </p>
              <code
                className="brain-id"
                title="Tap to copy"
                onClick={() => navigator.clipboard?.writeText("/link <name> <passcode>")}
                style={{ cursor: "pointer", display: "block", margin: "6px 0", padding: "4.5px", background: "rgba(0,0,0,0.35)", borderRadius: "4px", fontSize: "11px" }}
              >
                /link &lt;name&gt; &lt;passcode&gt;
              </code>
              <p className="budget-note" style={{ fontSize: "11px" }}>
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
                  Budget reached — AI is paused. Recharge at platform.openai.com, then raise budget.
                </p>
              ) : usage.low ? (
                <p className="budget-note budget-low">Running low — ~${usage.remainingUsd.toFixed(2)} left.</p>
              ) : (
                <p className="budget-note">
                  ~${usage.remainingUsd.toFixed(2)} of estimated spend left.
                </p>
              )}
              <div className="budget-actions" style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder={`$${usage.budgetUsd}`}
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  style={{
                    width: "60px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid var(--glass-border)",
                    color: "var(--text)",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    font: "inherit",
                    fontSize: "11px"
                  }}
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
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                >
                  Set budget
                </button>
                <button
                  className="mini"
                  onClick={async () => {
                    const u = await resetUsage();
                    if (u) setUsage(u);
                  }}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
