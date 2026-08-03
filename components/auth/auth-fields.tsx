"use client";

import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import {
  type InputHTMLAttributes,
  type ReactNode,
  useId,
  useState,
} from "react";

type FieldIcon = "email" | "password" | "user" | "none";

const icons: Record<Exclude<FieldIcon, "none">, ReactNode> = {
  email: <Mail size={18} strokeWidth={1.5} aria-hidden />,
  password: <Lock size={18} strokeWidth={1.5} aria-hidden />,
  user: <User size={18} strokeWidth={1.5} aria-hidden />,
};

export function AuthTextField({
  label,
  icon = "none",
  optional,
  id: idProp,
  className: _className,
  ...inputProps
}: {
  label: string;
  icon?: FieldIcon;
  optional?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;

  return (
    <label className="auth-field" htmlFor={inputId}>
      <span className="auth-field__label">
        {label}
        {optional ? <span className="optional"> (optional)</span> : null}
      </span>
      <span className={`auth-field__control${icon !== "none" ? " has-icon" : ""}`}>
        {icon !== "none" ? <span className="auth-field__icon">{icons[icon]}</span> : null}
        <input id={inputId} className="auth-field__input" {...inputProps} />
      </span>
    </label>
  );
}

export function AuthPasswordField({
  label,
  autoComplete,
  name,
  required,
  minLength,
  id: idProp,
  ...inputProps
}: {
  label: string;
  autoComplete?: string;
  name: string;
  required?: boolean;
  minLength?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <label className="auth-field" htmlFor={inputId}>
      <span className="auth-field__label">{label}</span>
      <span className="auth-field__control has-icon has-toggle">
        <span className="auth-field__icon">{icons.password}</span>
        <input
          {...inputProps}
          id={inputId}
          className="auth-field__input"
          type={visible ? "text" : "password"}
          name={name}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          className="auth-field__toggle"
          onClick={() => setVisible(value => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff size={18} strokeWidth={1.5} aria-hidden />
          ) : (
            <Eye size={18} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </span>
    </label>
  );
}
