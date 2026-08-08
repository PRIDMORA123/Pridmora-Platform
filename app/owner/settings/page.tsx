"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { apiJson } from "@/lib/api-client";
import { formatMoneyMinor } from "@/lib/owner/money";
import type { PlatformPlan } from "@/lib/owner/types";

type SettingsPayload = {
  settings: Array<{
    key: string;
    value: Record<string, unknown>;
    description: string | null;
    updatedAt: string;
  }>;
  plans: PlatformPlan[];
  secretsNote: string;
};

export default function OwnerSettingsPage() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState("");

  async function load() {
    setLoading(true);
    try {
      const payload = await apiJson<SettingsPayload>("/api/owner/settings");
      setData(payload);
      const nextDrafts: Record<string, string> = {};
      for (const setting of payload.settings) {
        nextDrafts[setting.key] = JSON.stringify(setting.value, null, 2);
      }
      setDrafts(nextDrafts);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(key: string) {
    setSavingKey(key);
    try {
      const value = JSON.parse(drafts[key] ?? "{}") as Record<string, unknown>;
      await apiJson("/api/owner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <OwnerShell
      title="Settings"
      subtitle="Platform administration defaults. Secrets and API keys are never exposed here."
    >
      {loading ? <p className="owner-muted">Loading settings…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {data ? (
        <>
          <p className="owner-muted">{data.secretsNote}</p>

          <section className="owner-panel">
            <h2 className="owner-panel__title">Plans</h2>
            {data.plans.length === 0 ? (
              <OwnerEmpty
                title="No plans configured"
                description="Platform plans can be managed in the database and will appear here."
              />
            ) : (
              <div className="owner-table-wrap">
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Name</th>
                      <th scope="col">Billing</th>
                      <th scope="col">Seats</th>
                      <th scope="col">Unit amount</th>
                      <th scope="col">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.plans.map(plan => (
                      <tr key={plan.id}>
                        <td>{plan.code}</td>
                        <td>{plan.name}</td>
                        <td>{plan.billingFrequency}</td>
                        <td>{plan.seatsIncluded ?? "—"}</td>
                        <td>
                          {plan.unitAmountMinor === null
                            ? "Not set"
                            : formatMoneyMinor(plan.unitAmountMinor, plan.currency)}
                        </td>
                        <td>{plan.isActive ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.settings.map(setting => (
            <section key={setting.key} className="owner-panel">
              <h2 className="owner-panel__title">
                {setting.key.replaceAll("_", " ")}
              </h2>
              {setting.description ? (
                <p className="owner-muted">{setting.description}</p>
              ) : null}
              <div className="owner-field" style={{ marginTop: "0.75rem" }}>
                <label htmlFor={`setting-${setting.key}`}>Configuration JSON</label>
                <textarea
                  id={`setting-${setting.key}`}
                  value={drafts[setting.key] ?? ""}
                  onChange={event =>
                    setDrafts(prev => ({
                      ...prev,
                      [setting.key]: event.target.value,
                    }))
                  }
                  rows={8}
                />
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="owner-button"
                  disabled={savingKey === setting.key}
                  onClick={() => void save(setting.key)}
                >
                  {savingKey === setting.key ? "Saving…" : "Save"}
                </button>
              </div>
            </section>
          ))}
        </>
      ) : null}
    </OwnerShell>
  );
}
