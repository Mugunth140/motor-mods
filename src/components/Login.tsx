import { ArrowRight, KeyRound, ShieldCheck, User2 } from "lucide-react";
import React, { useState } from "react";
import { UserRole, UserSession } from "../types";
import { Button, Input, useToast } from "./ui";

interface LoginProps {
  onLogin: (session: UserSession) => void;
}

const DEFAULT_USERS: Record<UserRole, { pin: string; name: string; note: string }> = {
  admin: { pin: "2468", name: "Admin", note: "Full System Access" },
  staff: { pin: "1357", name: "Staff", note: "POS & Inventory View" },
};

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<UserRole>("admin");
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    // Simulate network delay for effect
    await new Promise(resolve => setTimeout(resolve, 600));

    try {
      const expectedPin = DEFAULT_USERS[role].pin;
      if (pin.trim() !== expectedPin) {
        setError("Incorrect PIN");
        setIsSubmitting(false);
        return;
      }

      const session: UserSession = { role, name: DEFAULT_USERS[role].name };
      onLogin(session);
      toast.success("Welcome back", `Signed in as ${session.name}`);
    } catch {
      setIsSubmitting(false);
    }
  };

  const useDefaultPin = () => setPin(DEFAULT_USERS[role].pin);

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px] mix-blend-screen" />
      </div>

      <div className="w-full max-w-4xl bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-2xl overflow-hidden grid md:grid-cols-5 relative z-10 animate-in fade-in zoom-in-95 duration-500">

        {/* Left Panel - Visual */}
        <div className="md:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay transition-transform duration-1000 group-hover:scale-110" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/60 to-slate-900/90" />

          <div className="relative z-10">
            <img src="/logo.png" alt="MotorMods" className="w-16 h-16 object-contain mb-6 drop-shadow-lg bg-white rounded-2xl p-2.5" />
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">MotorMods</h1>
            <p className="text-slate-400 text-sm font-medium tracking-wide uppercase opacity-80">Performance Billing</p>
          </div>

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3 text-slate-300 text-sm">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-indigo-400">
                <ShieldCheck size={16} />
              </div>
              <span>Secure Access</span>
            </div>
            <div className="h-px w-full bg-white/10" />
            <p className="text-xs text-slate-500 leading-relaxed">
              Authorized personnel only. All activities are monitored and logged for security purposes.
            </p>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="md:col-span-3 p-8 md:p-12 bg-slate-950/50 flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-slate-400">Select your role to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Role Selection */}
            <div className="grid grid-cols-2 gap-4">
              {(["admin", "staff"] as UserRole[]).map((r) => {
                const isActive = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRole(r);
                      setPin("");
                      setError("");
                    }}
                    className={`
                      relative group p-4 rounded-2xl border transition-all duration-300 text-left overflow-hidden
                      ${isActive
                        ? "bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]"
                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                      }
                    `}
                  >
                    <div className={`
                      w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors duration-300
                      ${isActive ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400 group-hover:text-slate-200"}
                    `}>
                      {r === "admin" ? <User2 size={20} /> : <KeyRound size={20} />}
                    </div>
                    <span className={`block font-semibold capitalize mb-0.5 ${isActive ? "text-indigo-400" : "text-slate-200"}`}>
                      {r}
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      {DEFAULT_USERS[r].note}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* PIN Input */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Security PIN</label>
                  <button
                    type="button"
                    onClick={useDefaultPin}
                    className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
                  >
                    Use default ({DEFAULT_USERS[role].pin})
                  </button>
                </div>
                <div className="relative group">
                  <Input
                    type="password"
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value);
                      if (error) setError("");
                    }}
                    className={`
                      !bg-slate-900/50 !border-white/10 !text-white placeholder:!text-slate-600 text-center text-2xl tracking-[0.5em] h-14 font-mono
                      focus:!border-indigo-500/50 focus:!ring-indigo-500/20 transition-all duration-300
                      ${error ? "!border-red-500/50 focus:!border-red-500/50 focus:!ring-red-500/20" : ""}
                    `}
                    autoFocus
                  />
                  {error && (
                    <div className="absolute -bottom-6 left-0 w-full text-center">
                      <span className="text-xs text-red-400 font-medium animate-in slide-in-from-top-1 fade-in duration-200">
                        {error}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                className={`
                  w-full h-12 text-base font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 
                  border-0 shadow-lg shadow-indigo-900/20 transition-all duration-300
                  ${isSubmitting ? "opacity-80 cursor-wait" : "hover:shadow-indigo-500/20 hover:-translate-y-0.5"}
                `}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Access System <ArrowRight size={18} />
                  </span>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-center text-slate-600 text-xs">
        <p>&copy; {new Date().getFullYear()} MotorMods System v0.2.0</p>
      </div>
    </div>
  );
};
