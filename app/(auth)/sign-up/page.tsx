"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Eye, EyeOff, Loader2, ArrowRight, Users, Bus, ShieldCheck, Mail, Lock, User, Phone, KeyRound, ArrowLeft } from "lucide-react";

type Role = "passenger" | "driver" | "admin";

const ROLES = [
  {
    value: "passenger" as Role,
    label: "Passenger",
    desc: "Track buses & plan trips",
    icon: Users,
    color: "#06B6D4",
  },
  {
    value: "driver" as Role,
    label: "Driver",
    desc: "Navigate & report issues",
    icon: Bus,
    color: "#22C55E",
  },
  {
    value: "admin" as Role,
    label: "Admin",
    desc: "Manage the full fleet & system",
    icon: ShieldCheck,
    color: "#A855F7",
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [phone, setPhone]             = useState("");
  const [password, setPassword]       = useState("");
  const [adminCode, setAdminCode]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole]               = useState<Role>("passenger");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (role === "admin" && adminCode !== "12202085") { setError("Invalid Admin Secret Code."); return; }
    setLoading(true);
    try {
      const result = await signUp.email({
        name, email, password,
        // @ts-expect-error - additional fields
        role, phone,
        callbackURL: role === "admin" ? "/admin" : role === "driver" ? "/driver" : "/passenger",
      });
      if (result.error) { setError(result.error.message ?? "Sign up failed."); return; }
      router.push(role === "admin" ? "/admin" : role === "driver" ? "/driver" : "/passenger");
      router.refresh();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const inputClasses = "w-full h-11 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-50 px-4 pl-11 text-sm outline-none transition-colors focus:bg-white dark:focus:bg-gray-900 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 placeholder-gray-400 dark:placeholder-gray-500";

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-white dark:bg-[#111827] rounded-3xl shadow-xl dark:shadow-2xl border border-gray-100 dark:border-gray-800 transition-colors duration-300">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50">
          Create account
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Join the smart transit network today
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-lg text-sm bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-600 dark:bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Role Selector */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-900 dark:text-gray-200">I am a</label>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(({ value, label, desc, icon: Icon, color }) => {
              const selected = role === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRole(value)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all border ${
                    selected 
                      ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500 shadow-sm" 
                      : "bg-white dark:bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${selected ? "" : "text-gray-400 dark:text-gray-500"}`} style={{ color: selected ? color : undefined }} />
                  <span className={`text-xs font-semibold ${selected ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}`}>{label}</span>
                  <span className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Admin Secret Code */}
        {role === "admin" && (
          <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
            <label className="block text-sm font-medium text-purple-600 dark:text-purple-400">Admin Secret Code</label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-500 dark:text-purple-400" />
              <input
                type="password"
                placeholder="Enter system secret code"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                className={`${inputClasses} focus:border-purple-500 focus:ring-purple-500 dark:focus:border-purple-400 border-purple-200 dark:border-purple-500/30`}
              />
            </div>
          </div>
        )}

        {/* Name */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Full name</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              placeholder="John Doe"
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            Phone <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              value={password}
              required
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClasses} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg font-semibold text-white flex items-center justify-center gap-2 mt-4 disabled:opacity-70 transition-all active:scale-[0.98] bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 shadow-sm shadow-indigo-600/20"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><span>Create Account</span><ArrowRight className="h-4 w-4" /></>
          }
        </button>
      </form>

      {/* Footer */}
      <div className="mt-8 text-sm text-center flex flex-col gap-3">
        <p className="text-gray-600 dark:text-gray-400">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
            Sign in
          </Link>
        </p>
        <p>
          <Link href="/" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Back to live map
          </Link>
        </p>
      </div>
    </div>
  );
}
