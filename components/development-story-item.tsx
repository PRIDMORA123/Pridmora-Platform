type DevelopmentStoryItemProps = {
  label: string;
  content?: string | null;
};

export function DevelopmentStoryItem({
  label,
  content,
}: DevelopmentStoryItemProps) {
  if (!content) return null;

  return (
    <div className="development-story-item">
      <p className="development-story-item-label">{label}</p>
      <p className="development-story-item-content">{content}</p>
    </div>
  );
}
