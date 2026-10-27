import type { InputHTMLAttributes } from "react";
import { numericInputProps } from "@/lib/numeric-input";
export default function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={"rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-[#404040] dark:bg-[#111111] dark:text-[#f5f5f5] dark:placeholder:text-[#aaaaaa] " + className} {...(props.type === "number" ? numericInputProps(props.step !== undefined && props.step !== 1 && props.step !== "1") : {})} {...props} />;
}
