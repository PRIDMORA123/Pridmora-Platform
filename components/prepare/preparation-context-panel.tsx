import type {
  PreparationContextSection,
  PreparationIntelligenceViewModel,
} from "@/lib/preparation-intelligence";

function ContextButton({
  title,
  description,
  available,
  highlighted,
  onClick,
}: {
  title: string;
  description: string;
  available: boolean;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={
        highlighted
          ? "context-panel-button is-highlighted"
          : "context-panel-button"
      }
      onClick={onClick}
    >
      <strong>{title}</strong>
      <span>
        {available ? description : `${description} · Not yet available`}
      </span>
    </button>
  );
}

export function PreparationContextPanel({
  intelligence,
  onOpenSection,
}: {
  intelligence: PreparationIntelligenceViewModel;
  onOpenSection: (section: PreparationContextSection) => void;
}) {
  return (
    <aside className="preparation-context-panel">
      <header>
        <p className="prepare-eyebrow">Relationship context</p>
        <h3>Useful context</h3>
        <p>Open only what you need while preparing.</p>
      </header>

      <ContextButton
        title="Previous conversation"
        description="Summary and agreed outcomes"
        available={Boolean(intelligence.previousConversation)}
        onClick={() => onOpenSection("previous_conversation")}
      />

      <ContextButton
        title="Open commitments"
        description={`${intelligence.outstandingCommitments.length} currently open`}
        available={intelligence.outstandingCommitments.length > 0}
        onClick={() => onOpenSection("commitments")}
      />

      <ContextButton
        title="Recent reflection"
        description="Latest approved reflection"
        available={Boolean(intelligence.recentReflection)}
        onClick={() => onOpenSection("reflection")}
      />

      <ContextButton
        title="Development journey"
        description="Themes and approved changes"
        available={intelligence.developmentUpdates.length > 0}
        onClick={() => onOpenSection("development")}
      />

      <ContextButton
        title="Conversation guidance"
        description="Questions and relevant framework"
        available
        highlighted
        onClick={() => onOpenSection("guidance")}
      />
    </aside>
  );
}
