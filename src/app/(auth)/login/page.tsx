"use client";

import FormLabel from "@/components/ui/FormLabel";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useNotifications } from "@/components/ui/SnackbarProvider";
import { useRouter } from "next/navigation";

const mutedText = "text-[#626975] dark:text-[#aaaaaa]";
const subtleText = "text-[#68707d] dark:text-[#909090]";
const borderColor = "border-[#e0e3e8] dark:border-[#303030]";
const buttonFocus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#006bd6] dark:focus-visible:outline-[#0074df]";
const inputClasses = "h-[49px] w-full rounded-lg border border-[#dce0e6] bg-[#f8f9fb] py-2 pl-10 pr-4 text-sm text-[#171b24] outline-none placeholder:text-[#68707d] placeholder:opacity-100 transition-[border-color,box-shadow] duration-150 focus:border-[#006bd6] focus:shadow-[0_0_0_3px_rgb(0_116_223_/_15%)] motion-reduce:transition-none dark:border-[#2b2b2b] dark:bg-[#111111] dark:text-[#f5f5f5] dark:placeholder:text-[#909090] dark:focus:border-[#0074df]";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { notify, dismiss } = useNotifications();
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  async function viewAsGuest() {
    if (saving) return;
    setSaving(true); dismiss();
    try {
      const response = await fetch("/api/auth/guest", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Unable to open guest access.");
      notify("Welcome, Guest. You have read-only access.");
      router.replace("/dashboard"); router.refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to open guest access.", "error"); }
    finally { setSaving(false); }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); dismiss();
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Unable to sign in.");
      notify("Signed in successfully.");
      router.replace("/dashboard"); router.refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to sign in.", "error"); }
    finally { setSaving(false); }
  }

  return (
    <main className="grid min-h-svh grid-rows-[auto_1fr_auto] justify-items-center gap-12 bg-[#f4f5f7] px-10 pt-[30px] pb-6 text-[#171b24] dark:bg-[#101010] dark:text-[#f5f5f5] max-[540px]:gap-8 max-[540px]:px-5 max-[540px]:pt-5 max-[540px]:pb-[22px]">
      <header className="flex w-full items-center justify-between gap-4">
        <span className="text-xl font-bold tracking-[-0.8px]">Nexora</span>
        <ThemeToggle />
      </header>

      <section className={`w-full max-w-[470px] min-h-[400px] self-center rounded-[14px] border bg-white px-8 pt-11 pb-7 shadow-[0_16px_48px_rgb(24_39_65_/_6%)] dark:bg-[#191919] dark:shadow-[0_16px_48px_rgb(0_0_0_/_12%)] max-[540px]:px-6 max-[540px]:pt-[34px] max-[540px]:pb-6 ${borderColor}`} aria-labelledby="login-heading">
        <div className="text-center">
          <p className={`mb-[19px] text-[10px] font-semibold tracking-[2px] ${subtleText}`}>YOUR BUSINESS, CONNECTED</p>
          <h1 className="text-[25px] leading-[1.25] font-semibold tracking-[-1px] max-[540px]:text-[27px]" id="login-heading">Welcome Back</h1>
          <p className={`mt-[13px] text-sm leading-[1.6] ${mutedText}`}>Sign in to your Nexora workspace.</p>
        </div>

        <form className="mt-[34px] grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2"><FormLabel label="Email address" required htmlFor="email" className="text-xs font-medium">{null}</FormLabel><div className="relative w-full">
            <Mail aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input className={inputClasses} aria-label="Email address" id="email" name="email" type="email" placeholder="Email address" autoComplete="username" required />
          </div></div>
          <div className="grid gap-[9px]">
            <FormLabel label="Password" required htmlFor="password" className="text-xs font-medium">{null}</FormLabel>
            <div className="relative">
               <Lock aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input className={`${inputClasses} pr-[68px]`} aria-label="Password" id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Password" autoComplete="current-password" required />
              <button className={`absolute top-[5px] right-[7px] h-[39px] rounded border-0 bg-transparent px-2.5 text-xs hover:text-[#171b24] dark:hover:text-[#f5f5f5] ${mutedText} ${buttonFocus}`} type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              </button>
            </div>
          </div>
          <button className={`mt-[5px] min-h-[46px] rounded-lg border border-white/16 bg-[#006bd6] text-sm font-semibold text-white shadow-[0_2px_3px_rgb(0_0_0_/_16%)] transition-colors duration-150 hover:bg-[#005bb8] motion-reduce:transition-none dark:bg-[#0074df] dark:hover:bg-[#1687ef] ${buttonFocus}`} type="submit" disabled={saving}>{saving ? "Signing in..." : "Login"}</button>
        </form>
        <div className="mt-5 text-center"><button type="button" disabled={saving} onClick={() => void viewAsGuest()} className={`rounded px-2 py-1 text-sm font-medium text-[#006bd6] underline underline-offset-4 hover:text-[#005bb8] disabled:opacity-50 dark:text-[#1687ef] ${buttonFocus}`}>View as guest</button><p className={`mt-1 text-xs ${subtleText}`}>Explore all modules with read-only access.</p></div>

        <p className={`mt-7 border-t pt-[23px] text-center text-xs leading-[1.7] ${borderColor} ${subtleText}`}>Need an account? Contact your administrator.</p>
      </section>

    </main>
  );
}
