import { redirect } from "next/navigation";

/**
 * Public self-registration is closed for organisation-led commercial access.
 * Invitations use inviteUserByEmail / magic-link — not this route.
 */
export default function SignUpPage() {
  redirect("/auth/sign-in");
}
