"use client";

import { useEffect, useId, useState } from "react";
import { IdentityButton } from "@/components/identity/button";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import { SettingsSection } from "@/components/organisation/settings-section";
import { apiJson } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";
import {
  formatOrganisationDate,
  retentionPolicyDisplayLabel,
} from "@/lib/organisations/format";
import {
  LICENCE_STATUS_LABELS,
  ORGANISATION_TYPE_LABELS,
  ORGANISATION_TYPES,
  type LicenceStatus,
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
  licence: {
    planName: string;
    status: LicenceStatus;
    startsAt: string | null;
    endsAt: string | null;
    seatsPurchased: number;
    seatsInUse: number;
    seatsAvailable: number;
    seatsLabel: string;
  };
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
          <SettingsSection
            title="Licence"
            description="Pilot licence details for this organisation. Seat allocation is managed outside the product."
          >
            <dl className="organisation-licence-meta">
              <div>
                <dt>Plan</dt>
                <dd>{settings.licence.planName}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {LICENCE_STATUS_LABELS[settings.licence.status] ??
                    settings.licence.status}
                </dd>
              </div>
              <div>
                <dt>Start date</dt>
                <dd>{formatOrganisationDate(settings.licence.startsAt)}</dd>
              </div>
              <div>
                <dt>End / renewal</dt>
                <dd>{formatOrganisationDate(settings.licence.endsAt)}</dd>
              </div>
            </dl>
            <div className="organisation-seats-summary" aria-live="polite">
              <p className="organisation-seats-summary__label">Seats</p>
              <p className="organisation-seats-summary__value">
                {settings.licence.seatsLabel}
              </p>
              <p className="organisation-field-hint">
                {settings.licence.seatsAvailable === 1
                  ? "1 practitioner seat available."
                  : `${settings.licence.seatsAvailable} practitioner seats available.`}{" "}
                Owners, administrators and oversight members use a seat only when
                they also have practitioner access or active relationship
                assignments. Deactivating a member releases the seat without
                deleting history.
              </p>
            </div>
          </SettingsSection>

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
