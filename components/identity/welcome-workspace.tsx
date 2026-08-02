"use client";

import { IdentityButton } from "@/components/identity/button";
import { IdentityPathMark } from "@/components/identity/path-mark";
import { BRAND } from "@/lib/brand";

type WelcomeWorkspaceProps = {
  coachFirstName: string;
  onCreatePerson: () => void;
};

function WelcomeStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <li className="welcome-step">
      <span className="welcome-step-number">{number}</span>

      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </li>
  );
}

export function WelcomeWorkspace({
  coachFirstName,
  onCreatePerson,
}: WelcomeWorkspaceProps) {
  return (
    <section className="welcome-workspace" aria-label={`Welcome, ${coachFirstName}`}>
      <div className="welcome-workspace-mark">
        <IdentityPathMark size={42} />
      </div>

      <p className="home-eyebrow">Welcome to the {BRAND.productShortName}</p>

      <h1 className="identity-display">
        Begin your first coaching relationship
      </h1>

      <p className="welcome-workspace-introduction">
        Add a person, agree the coaching purpose and begin building an
        evidence-led development journey.
      </p>

      <div className="welcome-workspace-action">
        <IdentityButton
          variant="primary"
          size="lg"
          onClick={onCreatePerson}
        >
          Add your first person
        </IdentityButton>
      </div>

      <ol className="welcome-workspace-journey">
        <WelcomeStep
          number="01"
          title="Create the coaching relationship"
          description="Record the person and the purpose of the coaching."
        />

        <WelcomeStep
          number="02"
          title="Prepare for the conversation"
          description="Review the latest context and focus your thinking."
        />

        <WelcomeStep
          number="03"
          title="Coach and reflect"
          description="Capture what mattered without interrupting the conversation."
        />

        <WelcomeStep
          number="04"
          title="Understand development"
          description="See meaningful changes and patterns emerge over time."
        />
      </ol>
    </section>
  );
}
