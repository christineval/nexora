
import type { LabelHTMLAttributes, ReactNode } from "react";

interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
    label: string;
    children: ReactNode;
    required?: boolean;
}

export default function FormLabel({
    label,
    children,
    required = false,
    className = "",
    ...props
}: FormLabelProps) {
  return (
    <label
      {...props}
      className={`grid gap-1.5 text-sm font-medium ${className}`}
    >
      <span>
        {label}
        {required && (
          <span className="ml-1 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </span>

      {children}
    </label>
  );
}
