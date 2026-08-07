import {
  CoachingWorkItem,
  type CoachingWorkItemProps,
} from "@/components/identity/coaching-work-item";

export type ConversationsInProgressItem = CoachingWorkItemProps & {
  id: string;
};

export function ConversationsInProgress({
  items,
  totalCount,
  onViewAll,
  description,
}: {
  items: ConversationsInProgressItem[];
  totalCount: number;
  onViewAll?: () => void;
  description?: string;
}) {
  return (
    <section
      className="home-workspace-panel home-conversations-panel"
      aria-labelledby="conversations-in-progress-title"
    >
      <header className="home-section-header">
        <div>
          <p className="home-section-eyebrow">Active work</p>
          <h2 id="conversations-in-progress-title">Conversations in progress</h2>
          <p>{description ?? "Continue the management work already under way."}</p>
        </div>
      </header>

      {items.length > 0 ? (
        <div className="coaching-work-list">
          {items.map(item => (
            <CoachingWorkItem key={item.id} {...item} />
          ))}
        </div>
      ) : (
        <div className="identity-empty-state identity-empty-state--compact">
          <p>No conversations are currently in progress.</p>
          <p>Prepared and active conversations will appear here.</p>
        </div>
      )}

      {totalCount > items.length && onViewAll ? (
        <div className="home-panel-footer">
          <button type="button" className="identity-text-action" onClick={onViewAll}>
            View all active conversations
          </button>
        </div>
      ) : null}
    </section>
  );
}
