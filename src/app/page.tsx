
"use client";
import { useState, useEffect } from "react";
import LoginPage from "./login/page";
import SignupPage from "./signup/page";
import PDFPage from "./pdf/page";

export default function Home() {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check for existing authentication on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Verify the token with the backend
      fetch('/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => {
        if (res.ok) {
          setIsAuthenticated(true);
          window.location.href = '/dashboard'; // Redirect to dashboard on successful auth check
        } else {
          // If token is invalid, remove it
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
      });
    }
  }, []);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    window.location.href = '/dashboard'; // Redirect to dashboard after login
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    window.location.href = '/'; // Redirect to home on logout
  };

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = '/dashboard';
    }
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-[#2D2654] flex flex-col">
      <nav className="flex justify-between items-center px-8 py-6 bg-[#352D63] shadow-lg">
        <div className="font-extrabold text-2xl tracking-wide text-white">Study Fetch Assessment</div>
        {!isAuthenticated && (
          <div>
            <button
              className={`mr-2 px-6 py-2 rounded-xl font-semibold transition-colors duration-200 ${
                authMode === 'login' 
                  ? 'bg-[#6A5DB9] text-white shadow-lg hover:bg-[#7A6DC9]' 
                  : 'bg-[#453A7C] text-white hover:bg-[#554A8C]'
              }`}
              onClick={() => setAuthMode('login')}
            >Login</button>
            <button
              className={`px-6 py-2 rounded-xl font-semibold transition-colors duration-200 ${
                authMode === 'signup' 
                  ? 'bg-[#6A5DB9] text-white shadow-lg hover:bg-[#7A6DC9]' 
                  : 'bg-[#453A7C] text-white hover:bg-[#554A8C]'
              }`}
              onClick={() => setAuthMode('signup')}
            >Sign Up</button>
          </div>
        )}
        {isAuthenticated && (
          <button
            className="px-6 py-2 rounded-xl bg-[#453A7C] text-white font-semibold shadow-lg hover:bg-[#554A8C] transition-colors duration-200"
            onClick={handleLogout}
          >Logout</button>
        )}
      </nav>
      <main className="flex-1 flex items-center justify-center px-4">
        {!isAuthenticated ? (
          <div className="w-full max-w-md mx-auto bg-[#352D63] rounded-2xl shadow-2xl p-10 mt-8 flex flex-col items-center">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="text-white/70 text-base">{authMode === 'login' ? 'Sign in to access your study workspace' : 'Join Study Fetch Assessment to start learning'}</p>
            </div>
            {authMode === 'login' ? (
              <LoginPage />
            ) : (
              <SignupPage />
            )}
          </div>
        ) : (
          <div className="w-full max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-8 mt-8">
            <PDFPage />
          </div>
        )}
      </main>
    </div>
  );
}
