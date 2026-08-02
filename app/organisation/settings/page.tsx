"use client";

import { useEffect, useId, useState } from "react";
import { IdentityButton } from "@/components/identity/button";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { SettingsSection } from "@/components/organisation/settings-section";
import { apiJson } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";
import { retentionPolicyDisplayLabel } from "@/lib/organisations/format";
import {
  ORGANISATION_TYPE_LABELS,
  ORGANISATION_TYPES,
  type OrganisationType,
} from "@/lib/organisations/types";
import {
  PREPARATION_STYLES,
  PREPARATION_STYLE_DESCRIPTIONS,
  PREPARATION_STYLE_LABELS,
  type PreparationStyle,
} from "@/lib/preparation-style";

type Settings = {
  id: string;
  name: string;
  organisationType: OrganisationType;
  defaultPreparationStyle: string | null;
  aiEnabled: boolean;
  dataRetentionPolicyLabel: string;
  brandingStatus: string;
  logoUrl: string | null;
};

export default function OrganisationSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameId = useId();
  const typeId = useId();
  const prepId = useId();
  const aiId = useId();
  const retentionId = useId();

  useEffect(() => {
    apiJson<{ settings: Settings; canManage: boolean }>(
      "/api/organisations/settings"
    )
      .then(payload => {
        setSettings(payload.settings);
        setCanManage(payload.canManage);
      })
      .catch(err =>
        setError(err instanceof Error ? err.message : "Unable to load settings.")
      );
  }, []);

  async function save() {
    if (!settings || !canManage || busy) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      await apiJson("/api/organisations/settings", {
        method: "PATCH",
        body: JSON.stringify({
          name: settings.name,
          organisationType: settings.organisationType,
          defaultPreparationStyle: settings.defaultPreparationStyle,
          aiEnabled: settings.aiEnabled,
          dataRetentionPolicyLabel: settings.dataRetentionPolicyLabel,
        }),
      });
      setSaved(true);
    } catch {
      setError(
        "Settings could not be saved. Your existing settings remain unchanged."
      );
    } finally {
      setBusy(false);
    }
  }

  const prepStyle = (settings?.defaultPreparationStyle ??
    "guided") as PreparationStyle;
  const retention = retentionPolicyDisplayLabel(
    settings?.dataRetentionPolicyLabel
  );

  return (
    <OrganisationShell
      title="Settings"
      subtitle="Workspace details, workflow defaults and data governance."
    >
      {error ? <p className="organisation-error">{error}</p> : null}
      {saved ? (
        <p className="organisation-success-message" role="status">
          Changes saved
        </p>
      ) : null}

      {settings ? (
        <div className="organisation-settings">
          <SettingsSection title="Workspace details">
            <label className="organisation-field" htmlFor={nameId}>
              <span>Organisation name</span>
              <input
                id={nameId}
                value={settings.name}
                disabled={!canManage || busy}
                onChange={e =>
                  setSettings({ ...settings, name: e.target.value })
                }
              />
            </label>
            <label className="organisation-field" htmlFor={typeId}>
              <span>Organisation type</span>
              <select
                id={typeId}
                value={settings.organisationType}
                disabled={!canManage || busy}
                onChange={e =>
                  setSettings({
                    ...settings,
                    organisationType: e.target.value as OrganisationType,
                  })
                }
              >
                {ORGANISATION_TYPES.map(type => (
                  <option key={type} value={type}>
                    {ORGANISATION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
          </SettingsSection>

          <SettingsSection title="Development workflow">
            <label className="organisation-field" htmlFor={prepId}>
              <span>Default preparation approach</span>
              <select
                id={prepId}
                value={prepStyle}
                disabled={!canManage || busy}
                onChange={e =>
                  setSettings({
                    ...settings,
                    defaultPreparationStyle: e.target.value,
                  })
                }
              >
                {PREPARATION_STYLES.map(style => (
                  <option key={style} value={style}>
                    {PREPARATION_STYLE_LABELS[style]}
                  </option>
                ))}
              </select>
            </label>
            <p className="organisation-field-hint">
              {PREPARATION_STYLE_DESCRIPTIONS[prepStyle]}
            </p>
          </SettingsSection>

          <SettingsSection title={BRAND.intelligenceName}>
            <label className="organisation-checkbox" htmlFor={aiId}>
              <input
                id={aiId}
                type="checkbox"
                checked={settings.aiEnabled}
                disabled={!canManage || busy}
                onChange={e =>
                  setSettings({ ...settings, aiEnabled: e.target.checked })
                }
              />
              <span>AI enabled at organisation level</span>
            </label>
            <p className="organisation-field-hint">
              When disabled, members cannot use AI-supported preparation,
              summaries or development intelligence in this workspace.
            </p>
            <p className="organisation-muted">
              Practitioner settings may further restrict AI use but cannot
              override an organisation-level prohibition.
            </p>
          </SettingsSection>

          <SettingsSection title="Data governance">
            <label className="organisation-field" htmlFor={retentionId}>
              <span>Data retention policy</span>
              {retention.readOnly ? (
                <p id={retentionId} className="organisation-readonly-value">
                  {retention.label}
                </p>
              ) : (
                <input
                  id={retentionId}
                  value={settings.dataRetentionPolicyLabel}
                  disabled={!canManage || busy}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      dataRetentionPolicyLabel: e.target.value,
                    })
                  }
                />
              )}
            </label>
          </SettingsSection>

          <SettingsSection title="Branding">
            <p className="organisation-muted">
              Custom organisation branding is not available in this release.
            </p>
          </SettingsSection>

          {canManage ? (
            <div className="organisation-settings__actions">
              <IdentityButton
                variant="primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save changes"}
              </IdentityButton>
            </div>
          ) : (
            <p className="organisation-muted">
              You can view settings but not change them.
            </p>
          )}
        </div>
      ) : null}
    </OrganisationShell>
  );
}
