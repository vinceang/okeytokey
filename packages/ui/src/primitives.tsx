import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { useId } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ variant = "secondary", className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`okey-button okey-button--${variant}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export function TextInput({ mono = false, className, ...rest }: TextInputProps) {
  return (
    <input
      className={`okey-input${mono ? " okey-input--mono" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`okey-select${className ? ` ${className}` : ""}`} {...rest} />;
}

export interface FieldProps {
  label: string;
  error?: string;
  children: (id: string) => ReactNode;
}

/** Label + control + optional error, wired for accessibility. */
export function Field({ label, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className="okey-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error !== undefined && <span className="okey-field-error">{error}</span>}
    </div>
  );
}

export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div className="okey-segmented" role="group" aria-label={rest["aria-label"]}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
