import { type GraphNode, type Fuel } from "@brain/shared";
import { type Health } from "../api/client.js";
import { type DockTab } from "./RightDock.js";

interface NotificationsBarProps {
  fuel: Fuel | null;
  nodes: GraphNode[];
  health: Health | null;
  onFocusNode: (id: number) => void;
  onOpenTab: (tab: DockTab) => void;
  demo: boolean;
}

export function NotificationsBar({ fuel, nodes, health, onFocusNode, onOpenTab, demo }: NotificationsBarProps) {
  if (demo) return null;

  const alerts: { id: string; type: "warning" | "info" | "error"; text: string; icon: string; actionText?: string; onClick?: () => void }[] = [];

  // 1. Low Fuel Alert (under 15 units)
  if (fuel && fuel.fuel < 15) {
    alerts.push({
      id: "low-fuel",
      type: "warning",
      icon: "⛽",
      text: `Low fuel (${Math.round(fuel.fuel)}/${fuel.capacity}). Soumaya will pause background maintenance soon.`,
      actionText: "Earn Fuel",
      onClick: () => {
        onOpenTab("actions");
      }
    });
  }

  // 2. LLM Degraded/Offline Alert
  if (health && health.llm && (health.llm.degraded || !health.llm.available)) {
    alerts.push({
      id: "llm-degraded",
      type: "error",
      icon: "⚠️",
      text: health.llm.degraded 
        ? "Cloud LLM limit exceeded. Running in offline fallback." 
        : "Cloud LLM offline. Running in offline fallback.",
      actionText: "Diagnostics",
      onClick: () => {
        onOpenTab("soumaya");
      }
    });
  }

  // 3. Pending Questions Alert
  const pendingNodes = nodes.filter(n => n.researchQuestions && n.researchQuestions.length > 0);
  if (pendingNodes.length > 0) {
    alerts.push({
      id: "pending-questions",
      type: "info",
      icon: "🛸",
      text: `${pendingNodes.length} memory deep-dive${pendingNodes.length === 1 ? "" : "s"} awaiting clarification.`,
      actionText: "Resolve",
      onClick: () => {
        onFocusNode(pendingNodes[0]!.id);
      }
    });
  }

  // 4. Due reminders — the one moment a reminder matters. (The Agenda used to be
  // the only surface and it HID reminders once due; nothing else ever alerted.)
  const nowMs = Date.now();
  const dueReminders = nodes.filter((n) => {
    if (n.kind === "action" || !n.remindAt) return false;
    const iso = n.remindAt.includes("Z") || n.remindAt.includes("+") ? n.remindAt : n.remindAt.replace(" ", "T") + "Z";
    return Date.parse(iso) <= nowMs;
  });
  if (dueReminders.length > 0) {
    alerts.push({
      id: "due-reminders",
      type: "info",
      icon: "🔔",
      text:
        dueReminders.length === 1
          ? `Reminder due: "${dueReminders[0]!.label.slice(0, 40)}"`
          : `${dueReminders.length} reminders due.`,
      actionText: "Agenda",
      onClick: () => {
        onOpenTab("actions");
      },
    });
  }

  // 5. Overdue Actions Alert
  const now = Date.now();
  const overdueActions = nodes.filter(n => {
    if (n.kind !== "action" || !n.expiresAt) return false;
    const isoDate = n.expiresAt.includes("Z") ? n.expiresAt : n.expiresAt.replace(" ", "T") + "Z";
    return Date.parse(isoDate) <= now;
  });
  if (overdueActions.length > 0) {
    alerts.push({
      id: "overdue-actions",
      type: "warning",
      icon: "⏰",
      text: `${overdueActions.length} action item${overdueActions.length === 1 ? "" : "s"} overdue.`,
      actionText: "Agenda",
      onClick: () => {
        onOpenTab("actions");
      }
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="notifications-bar">
      {alerts.map((alert) => (
        <div key={alert.id} className={`notification-chip ${alert.type}`}>
          <span className="nc-icon">{alert.icon}</span>
          <span className="nc-text">{alert.text}</span>
          {alert.actionText && alert.onClick && (
            <button className="nc-action-btn" onClick={alert.onClick}>
              {alert.actionText} →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
