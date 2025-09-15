"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PDF {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  chats: {
    id: string;
    messages: {
      messages: Array<{
        role: string;
        content: string;
      }>;
      annotations?: Array<{
        type: string;
        page: number;
        x: number;
        y: number;
        width?: number;
        height?: number;
        radius?: number;
      }>;
    };
    createdAt: string;
  }[];
}

export default function Dashboard() {
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }

    const fetchPDFs = async () => {
      try {
        const response = await fetch('/api/pdf/list', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          localStorage.removeItem('token');
          router.push('/');
          return;
        }

        const data = await response.json();
        if (response.ok) {
          setPdfs(data.pdfs);
        } else {
          setError(data.message || 'Failed to fetch PDFs');
        }
      } catch (err) {
        setError('Failed to load your documents');
      } finally {
        setLoading(false);
      }
    };

    fetchPDFs();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#2D2654] text-white">
      {/* Navigation */}
      <nav className="bg-[#352D63] shadow-lg px-8 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Study Fetch Assessment</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => document.getElementById('fileUpload')?.click()}
              className="px-6 py-3 bg-[#6A5DB9] rounded-xl hover:bg-[#7A6DC9] transition-all duration-200"
            >
              Upload New PDF
            </button>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-[#453A7C] rounded-xl hover:bg-[#554A8C] transition-all duration-200"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-12 px-8">
        {error && (
          <div className="bg-red-500/10 text-white/90 p-4 rounded-xl mb-8">
            {error}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          id="fileUpload"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              const formData = new FormData();
              formData.append('file', file);
              setLoading(true);
              
              try {
                const token = localStorage.getItem('token');
                const reader = new FileReader();
                reader.onload = async () => {
                  const base64 = (reader.result as string).split(',')[1];
                  const res = await fetch('/api/pdf/upload', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      filename: file.name,
                      content: base64,
                      title: file.name
                    }),
                  });
                  
                  if (res.ok) {
                    const response = await fetch('/api/pdf/list', {
                      headers: { 'Authorization': `Bearer ${token}` },
                    });
                    const data = await response.json();
                    setPdfs(data.pdfs);
                  } else {
                    setError('Failed to upload PDF');
                  }
                };
                reader.readAsDataURL(file);
              } catch (err) {
                setError('Failed to upload PDF');
              } finally {
                setLoading(false);
              }
            }
          }}
        />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pdfs.map((pdf) => (
            <div
              key={pdf.id}
              onClick={() => router.push(`/pdf?id=${pdf.id}`)}
              className="bg-[#352D63] rounded-xl p-6 cursor-pointer transform transition-all duration-200 
                       hover:translate-y-[-4px] hover:shadow-2xl group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-[#453A7C] rounded-lg group-hover:bg-[#5A4D99] transition-colors">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-white/70 text-sm">
                  {pdf.chats.length} chat{pdf.chats.length !== 1 ? 's' : ''}
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2 truncate">{pdf.title}</h3>
              <p className="text-white/70 text-sm">
                Uploaded on {new Date(pdf.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}

          {pdfs.length === 0 && !loading && (
            <div className="col-span-full text-center py-12 bg-[#352D63] rounded-xl">
              <div className="p-4 bg-[#453A7C] rounded-full inline-block mb-4">
                <svg className="w-8 h-8 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-white/70 mb-4">No documents uploaded yet</p>
              <button
                onClick={() => document.getElementById('fileUpload')?.click()}
                className="px-6 py-3 bg-[#6A5DB9] rounded-xl hover:bg-[#7A6DC9] transition-all duration-200"
              >
                Upload Your First PDF
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
