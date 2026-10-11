import type { InputHTMLAttributes } from "react";
export default function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={"rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-[#404040] dark:bg-[#111111] dark:text-[#f5f5f5] dark:placeholder:text-[#aaaaaa] " + className} {...props} />;
}
