"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  // Next.js App Router page components can't accept arbitrary props. Removed onSuccess prop.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.token) {
        // Store the token locally (consider httpOnly cookie for production security)
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        setMessage("Login successful! Redirecting...");
        // Give a short delay so user can see success message (optional)
        setTimeout(() => {
          router.push('/dashboard');
        }, 600);
      } else {
        setMessage(data.message || "Login failed. Please check your credentials.");
      }
    } catch (error) {
      console.error('Login error:', error);
      setMessage("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
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
              placeholder="Password"
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
                Signing in...
              </div>
            ) : (
              "Sign In"
            )}
          </button>
        </div>
        {message && (
          <p className="mt-4 text-center text-white/90 bg-red-500/10 px-4 py-3 rounded-lg">{message}</p>
        )}
        <p className="mt-6 text-center text-white/70">
          Don&apos;t have an account? <span className="text-white hover:text-[#6A5DB9] cursor-pointer transition-colors duration-200" onClick={() => window.location.reload()}>Sign Up</span>
        </p>
      </form>
    </div>
  );
}
