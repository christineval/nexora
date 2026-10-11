import type { ButtonHTMLAttributes } from "react";
export default function Button({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={"rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-50 " + className} {...props} />;
}
