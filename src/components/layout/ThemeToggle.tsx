"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/layout/ThemeProvider";
import { setTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const theme = useTheme();
  return (
    <div role="group" aria-label="Color theme" className="flex w-fit shrink-0 gap-1 rounded-[39px] border border-gray-200 bg-gray-50 p-1 dark:border-[#303030] dark:bg-[#111111]">
      {(["light", "dark"] as const).map((option) => {
        const Icon = option === "light" ? Sun : Moon;
        const label = option === "light" ? "Light mode" : "Dark mode";
        return (
          <button
            key={option}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={theme === option}
            onClick={() => setTheme(option)}
            className="flex size-10 items-center justify-center rounded-[39px] text-gray-500 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 aria-pressed:bg-white aria-pressed:text-gray-900 aria-pressed:shadow-sm dark:text-[#aaaaaa] dark:hover:text-[#f5f5f5] dark:aria-pressed:bg-[#303030] dark:aria-pressed:text-[#f5f5f5]"
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
