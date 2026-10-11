import type { HTMLAttributes } from "react";
export default function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={"rounded-xl border border-gray-200 dark:border-[#303030] bg-white dark:bg-[#191919] p-5 shadow-sm " + className} {...props} />;
}
