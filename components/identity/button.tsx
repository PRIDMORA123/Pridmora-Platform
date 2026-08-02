import type { ButtonHTMLAttributes } from "react";

type IdentityButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
};

export function IdentityButton({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: IdentityButtonProps) {
  return (
    <button
      type={type}
      className={`identity-button is-${variant} identity-button--${variant} is-${size} ${className}`.trim()}
      {...props}
    />
  );
}
