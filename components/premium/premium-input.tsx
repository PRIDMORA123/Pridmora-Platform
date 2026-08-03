import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from "react";

type PremiumInputBase = {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

export type PremiumInputProps = PremiumInputBase &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
    multiline?: false;
  };

export type PremiumTextareaProps = PremiumInputBase &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
    multiline: true;
  };

export function PremiumInput(props: PremiumInputProps | PremiumTextareaProps) {
  const generatedId = useId();
  const {
    label,
    optional,
    hint,
    error,
    className = "",
    id: idProp,
    ...rest
  } = props;
  const inputId = idProp ?? generatedId;
  const describedBy = [
    error ? `${inputId}-error` : null,
    hint && !error ? `${inputId}-hint` : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className={`premium-field identity-field ${className}`.trim()}>
      <label className="premium-field__label" htmlFor={inputId}>
        <span>{label}</span>
        {optional ? (
          <span className="premium-field__optional">Optional</span>
        ) : (
          <span className="premium-field__required" aria-hidden>
            *
          </span>
        )}
      </label>

      {props.multiline ? (
        <textarea
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          id={inputId}
          className={`premium-input identity-textarea${error ? " is-invalid" : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          id={inputId}
          className={`premium-input identity-input${error ? " is-invalid" : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}

      {error ? (
        <p id={`${inputId}-error`} className="identity-field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="premium-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PremiumFieldGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`premium-field-group ${className}`.trim()}>{children}</div>
  );
}
