export type ClientActionStatus = "open" | "completed" | "cancelled";

export type ClientAction = {
  id: string;
  title: string;
  ownerName: string;
  dueDate?: string | null;
  notes?: string | null;
  status: ClientActionStatus;
  completedAt?: string | null;
};
