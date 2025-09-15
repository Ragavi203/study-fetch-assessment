"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setSuccess(false);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      setSuccess(true);
      setMessage("Signup successful! Please sign in to continue.");
      setEmail("");
      setPassword("");
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } else {
      setMessage(data.error || "Signup failed.");
    }
    setLoading(false);
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="space-y-6">
          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-6 py-4 bg-[#2D2654] text-white placeholder-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6A5DB9] text-lg transition-all duration-200"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-6 py-4 bg-[#2D2654] text-white placeholder-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6A5DB9] text-lg transition-all duration-200"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#6A5DB9] text-white py-4 rounded-xl font-semibold text-lg shadow-lg hover:bg-[#7A6DC9] transition-all duration-200 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                Creating Account...
              </div>
            ) : (
              "Create Account"
            )}
          </button>
        </div>
        {message && (
          <p className={`mt-4 text-center px-4 py-3 rounded-lg ${
            success 
              ? 'text-white/90 bg-green-500/10' 
              : 'text-white/90 bg-red-500/10'
          }`}>{message}</p>
        )}
        <p className="mt-6 text-center text-white/70">
          Already have an account? <span className="text-white hover:text-[#6A5DB9] cursor-pointer transition-colors duration-200" onClick={() => window.location.reload()}>Sign In</span>
        </p>
      </form>
    </div>
  );
}
