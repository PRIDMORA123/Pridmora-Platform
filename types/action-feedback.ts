export type ActionStatus =
  | "idle"
  | "unsaved"
  | "loading"
  | "success"
  | "error";

export type ActionFeedbackState = {
  status: ActionStatus;
  message?: string;
};

export type ActionButtonStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

export function toActionButtonStatus(
  status: ActionStatus
): ActionButtonStatus {
  if (
    status === "loading" ||
    status === "success" ||
    status === "error"
  ) {
    return status;
  }

  return "idle";
}
