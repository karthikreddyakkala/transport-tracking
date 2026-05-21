"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, authClient } from "@/lib/auth-client";
import { Loader2, Eye, EyeOff, ArrowLeft, ShieldCheck } from "lucide-react";

function getRoleDashboard(role?: string): string {
  if (role === "admin") return "/admin";
  if (role === "driver") return "/driver";
  return "/passenger";
}

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed.");
        return;
      }
      const session = await authClient.getSession();
      const role = (session.data?.user as { role?: string } | undefined)?.role;
      router.push(redirectParam ?? getRoleDashboard(role));
      router.refresh();
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClasses = "w-full h-12 bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-cyan-500/30 rounded-lg text-gray-900 dark:text-cyan-50 px-4 text-sm outline-none transition-all focus:bg-white dark:focus:bg-slate-900 focus:border-cyan-500 dark:focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 placeholder-gray-400 dark:placeholder-cyan-700/50";

  return (
    <div className="w-full max-w-[780px] rounded-[20px] overflow-hidden shadow-2xl border border-gray-200 dark:border-cyan-500/20 flex flex-col md:flex-row min-h-[440px] bg-white dark:bg-slate-950 transition-colors duration-300">
      
      {/* LEFT - Form Panel */}
      <div className="flex-1 p-8 md:p-11 flex flex-col justify-between dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950">
        
        {/* Back to home */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:text-cyan-500/70 dark:hover:text-cyan-400 transition-colors mb-7"
        >
          <ArrowLeft size={14} /> Back to Home
        </Link>

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-widest uppercase text-gray-900 dark:text-cyan-400 drop-shadow-sm dark:drop-shadow-[0_0_15px_rgba(6,182,212,0.4)] leading-none mb-2">
            LOGIN
          </h1>
          <p className="text-gray-500 dark:text-cyan-500/50 text-xs tracking-widest uppercase">
            Welcome back, Commander.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 px-3.5 py-2.5 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className={inputClasses}
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClasses} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-cyan-500/50 dark:hover:text-cyan-400 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-lg font-bold text-white text-sm tracking-widest uppercase flex items-center justify-center gap-2 mt-2 transition-all active:scale-[0.98] bg-cyan-600 hover:bg-cyan-700 dark:bg-gradient-to-r dark:from-cyan-500 dark:to-cyan-600 dark:hover:from-cyan-400 dark:hover:to-cyan-500 shadow-md shadow-cyan-600/20 dark:shadow-[0_0_20px_rgba(6,182,212,0.3)] dark:hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] disabled:opacity-70"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "INITIATE LOGIN"}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-xs text-center text-gray-500 dark:text-white/40">
          New User?{" "}
          <Link
            href="/sign-up"
            className="font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
          >
            Initialize Protocol
          </Link>
        </p>
      </div>

      {/* RIGHT - Branding Panel */}
      <div className="hidden md:flex w-[280px] shrink-0 border-l border-gray-100 dark:border-cyan-500/10 flex-col items-center justify-center p-8 relative overflow-hidden bg-gray-50 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950">
        
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-cyan-500/5 dark:bg-cyan-500/10 blur-2xl" />

        {/* Brackets */}
        <div className="absolute top-5 left-5 w-5 h-5 border-t-2 border-l-2 border-cyan-500/30 dark:border-cyan-500/60" />
        <div className="absolute top-5 right-5 w-5 h-5 border-t-2 border-r-2 border-cyan-500/30 dark:border-cyan-500/60" />
        <div className="absolute bottom-5 left-5 w-5 h-5 border-b-2 border-l-2 border-cyan-500/30 dark:border-cyan-500/60" />
        <div className="absolute bottom-5 right-5 w-5 h-5 border-b-2 border-r-2 border-cyan-500/30 dark:border-cyan-500/60" />

        <div className="relative text-center flex flex-col items-center">
          <ShieldCheck className="w-16 h-16 mb-4 text-cyan-600 dark:text-cyan-400 opacity-80" />
          <p className="text-3xl font-black tracking-widest uppercase text-gray-900 dark:text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.2)] dark:drop-shadow-[0_0_20px_rgba(6,182,212,0.5)] leading-[1.15]">
            SYSTEM<br />SECURE
          </p>
          <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-cyan-500 to-transparent my-5 opacity-50 dark:opacity-100" />
          <p className="text-gray-500 dark:text-cyan-500/50 text-[10px] tracking-widest uppercase">
            TransitTrack v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
