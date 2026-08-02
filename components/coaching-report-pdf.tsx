import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type {
  CoachingReportDraft,
  ReportPrivacyOptions,
} from "@/lib/coaching-report";
import { formatValuesSectionText, reportTypeLabel } from "@/lib/coaching-report";
import { BRAND } from "@/lib/brand";

const colours = {
  navy: "#102f3a",
  teal: "#4f9d98",
  text: "#17333c",
  muted: "#6d7d82",
  line: "#dfe7e6",
  soft: "#f5f7f6",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.5,
    color: colours.text,
  },
  titlePage: {
    paddingTop: 72,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    color: colours.text,
    justifyContent: "space-between",
  },
  brandMark: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderColor: colours.teal,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  brandMarkText: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: colours.navy,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colours.teal,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: colours.navy,
    marginBottom: 10,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 12,
    color: colours.muted,
    marginBottom: 28,
    maxWidth: 420,
    lineHeight: 1.55,
  },
  metaBlock: {
    backgroundColor: colours.soft,
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: colours.line,
  },
  metaRow: {
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 8.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colours.muted,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 11,
    color: colours.navy,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colours.line,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8.5,
    color: colours.muted,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colours.navy,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colours.line,
  },
  body: {
    fontSize: 10.5,
    color: colours.text,
    lineHeight: 1.55,
  },
  item: {
    marginBottom: 8,
  },
  itemTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: colours.navy,
    marginBottom: 2,
  },
  muted: {
    fontSize: 9.5,
    color: colours.muted,
    lineHeight: 1.45,
  },
  disclaimer: {
    marginTop: 18,
    padding: 12,
    backgroundColor: colours.soft,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colours.line,
  },
  disclaimerText: {
    fontSize: 8.5,
    color: colours.muted,
    lineHeight: 1.45,
  },
});

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function PageFooter({
  reportType,
  period,
}: {
  reportType: string;
  period: string;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        Supported by {BRAND.intelligenceName} · {reportType} · {period} · For
        professional review
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

export function CoachingReportPdfDocument({
  draft,
  privacy,
}: {
  draft: CoachingReportDraft;
  privacy: ReportPrivacyOptions;
}) {
  const typeLabel = reportTypeLabel(draft.reportType);
  const clientDisplay = privacy.includeClientName ? draft.clientName : "Client";
  const coachDisplay = privacy.includeCoachName ? draft.coachName : null;

  const withDateRefs = (text: string) => {
    if (privacy.includeSessionDates) return text;
    return text.replace(/\s*·\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}/g, "").replace(/\s*\(\d{1,2}\s+[A-Za-z]+\s+\d{4}\)/g, "");
  };

  return (
    <Document
      title={`${typeLabel} — ${clientDisplay}`}
      author={BRAND.legalCompanyName}
      subject={typeLabel}
    >
      <Page size="A4" style={styles.titlePage}>
        <View>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>P</Text>
          </View>
          <Text style={styles.eyebrow}>{BRAND.productName}</Text>
          <Text style={styles.title}>{typeLabel}</Text>
          <Text style={styles.subtitle}>
            A coach-reviewed {BRAND.reportName} based on approved coaching
            records for the {BRAND.journeyName}. Evidence-based and
            coach-controlled. Supported by {BRAND.intelligenceName} for
            professional review.
          </Text>
          <View style={styles.metaBlock}>
            {privacy.includeClientName ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Client</Text>
                <Text style={styles.metaValue}>{draft.clientName}</Text>
              </View>
            ) : null}
            {coachDisplay ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Coach</Text>
                <Text style={styles.metaValue}>{coachDisplay}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Report type</Text>
              <Text style={styles.metaValue}>{typeLabel}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Report period</Text>
              <Text style={styles.metaValue}>{draft.reportPeriodLabel}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Approved sessions included</Text>
              <Text style={styles.metaValue}>{String(draft.sessionCount)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date generated</Text>
              <Text style={styles.metaValue}>{draft.dateGenerated}</Text>
            </View>
          </View>
        </View>
        <PageFooter reportType={typeLabel} period={draft.reportPeriodLabel} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Section title="1. Report Information">
          <Text style={styles.body}>
            {privacy.includeClientName ? `Client: ${draft.clientName}\n` : ""}
            {coachDisplay ? `Coach: ${coachDisplay}\n` : ""}
            {`Report type: ${typeLabel}\n`}
            {`Report period: ${draft.reportPeriodLabel}\n`}
            {`Approved sessions included: ${draft.sessionCount}\n`}
            {`Date generated: ${draft.dateGenerated}`}
          </Text>
        </Section>

        <Section title="2. Coaching Context">
          <Text style={styles.body}>{withDateRefs(draft.coachingContext)}</Text>
        </Section>

        <Section title="3. Professional Identity Development">
          <Text style={styles.body}>
            {withDateRefs(draft.professionalIdentityDevelopment)}
          </Text>
        </Section>

        <Section title="4. Key Themes">
          {draft.keyThemes.length === 0 ? (
            <Text style={styles.muted}>
              No recurring themes were evidenced across more than one selected approved session.
            </Text>
          ) : (
            draft.keyThemes.map(theme => (
              <View key={theme.theme} style={styles.item} wrap={false}>
                <Text style={styles.itemTitle}>
                  {theme.theme} · frequency {theme.frequency}
                </Text>
                <Text style={styles.body}>{theme.description}</Text>
                <Text style={styles.muted}>
                  Supporting sessions:{" "}
                  {privacy.includeSessionDates
                    ? theme.sessionRefs.join("; ")
                    : theme.sessionRefs
                        .map(ref => ref.replace(/\s*·\s*.+$/, ""))
                        .join("; ")}
                </Text>
              </View>
            ))
          )}
        </Section>

        <Section title="5. Strengths Developed">
          {draft.strengthsDeveloped.length === 0 ? (
            <Text style={styles.muted}>
              No strengths supported by approved session evidence were recorded for this period.
              Strengths listed here are observations from the coaching record, not formal
              assessments.
            </Text>
          ) : (
            draft.strengthsDeveloped.map(item => (
              <View key={item.label} style={styles.item} wrap={false}>
                <Text style={styles.itemTitle}>{item.label}</Text>
                <Text style={styles.body}>
                  Observed in {item.sessionsObserved} session
                  {item.sessionsObserved === 1 ? "" : "s"}. Example: {item.example}
                </Text>
                <Text style={styles.muted}>
                  Originating session:{" "}
                  {privacy.includeSessionDates
                    ? item.sessionRef
                    : item.sessionRef.replace(/\s*·\s*.+$/, "")}
                </Text>
              </View>
            ))
          )}
        </Section>

        <Section title="6. Values Emerging">
          <Text style={styles.body}>
            {withDateRefs(
              draft.valuesSectionText?.trim() ||
                formatValuesSectionText(draft.valuesEmerging)
            )}
          </Text>
        </Section>

        <Section title="7. Progress and Milestones">
          {draft.progressAndMilestones.length === 0 ? (
            <Text style={styles.muted}>
              No evidence-based achievements or milestones were recorded in the selected approved
              sessions.
            </Text>
          ) : (
            draft.progressAndMilestones.map((item, index) => (
              <View
                key={`${item.sessionNumber}-${index}-${item.title}`}
                style={styles.item}
                wrap={false}
              >
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.muted}>
                  Session {item.sessionNumber}
                  {privacy.includeSessionDates && item.date ? ` · ${item.date}` : ""}
                </Text>
              </View>
            ))
          )}
        </Section>

        {privacy.includeOutstandingCommitments ? (
          <Section title="8. Outstanding Development Areas">
            <Text style={styles.body}>
              {withDateRefs(draft.outstandingDevelopmentAreas)}
            </Text>
          </Section>
        ) : null}

        <Section title="9. Suggested Next Focus">
          {draft.suggestedNextFocus.length === 0 ? (
            <Text style={styles.muted}>
              No suggested next focus areas were generated for the selected sessions.
            </Text>
          ) : (
            draft.suggestedNextFocus.map(item => (
              <Text key={item} style={[styles.body, styles.item]}>
                {item}
              </Text>
            ))
          )}
        </Section>

        {privacy.includeCoachCommentary && draft.coachCommentary.trim() ? (
          <Section title="10. Coach Commentary">
            <Text style={styles.body}>{draft.coachCommentary.trim()}</Text>
          </Section>
        ) : null}

        <View style={styles.disclaimer} wrap={false}>
          <Text style={styles.disclaimerText}>
            This report is coach-reviewed and drawn only from approved coaching records. Possible
            observations and suggested next steps are labelled as such and do not constitute
            clinical, psychological, or diagnostic conclusions. The coach remains responsible for
            the final report.
          </Text>
        </View>

        <PageFooter reportType={typeLabel} period={draft.reportPeriodLabel} />
      </Page>
    </Document>
  );
}
