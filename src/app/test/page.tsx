'use client';

import { useState } from 'react';

export default function TestPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [pdfs, setPdfs] = useState([]);

  // Handle signup
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        setUploadStatus('Signup successful!');
      } else {
        setUploadStatus('Signup failed: ' + data.message);
      }
    } catch (error) {
      setUploadStatus('Signup error: ' + error);
    }
  };

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        setUploadStatus('Login successful!');
        fetchPDFs(data.token);
      } else {
        setUploadStatus('Login failed: ' + data.message);
      }
    } catch (error) {
      setUploadStatus('Login error: ' + error);
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle file upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !token) return;

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string)
          .replace('data:', '')
          .replace(/^.+,/, '');

        // Upload file
        const res = await fetch('/api/pdf/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            filename: selectedFile.name,
            title: selectedFile.name,
            content: base64String
          }),
        });

        const data = await res.json();
        if (data.pdf) {
          setUploadStatus('Upload successful!');
          fetchPDFs(token);
        } else {
          setUploadStatus('Upload failed: ' + data.error);
        }
      };

      reader.readAsDataURL(selectedFile);
    } catch (error) {
      setUploadStatus('Upload error: ' + error);
    }
  };

  // Fetch PDFs
  const fetchPDFs = async (currentToken: string) => {
    try {
      const res = await fetch('/api/pdf/list', {
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.status === 401) {
        setUploadStatus('Please log in again');
        setToken('');
        return;
      }
      const data = await res.json();
      if (data.pdfs) {
        setPdfs(data.pdfs);
      }
    } catch (error) {
      console.error('Error fetching PDFs:', error);
      setUploadStatus('Failed to fetch PDFs: ' + error);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Test Page</h1>
      
      {/* Auth Form */}
      <div className="mb-8 p-4 border rounded">
        <h2 className="text-xl mb-4">Authentication</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="block w-full mb-2 p-2 border rounded"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block w-full mb-2 p-2 border rounded"
        />
        <button
          onClick={handleSignup}
          className="mr-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Signup
        </button>
        <button
          onClick={handleLogin}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Login
        </button>
      </div>

      {/* Upload Form */}
      {token && (
        <div className="mb-8 p-4 border rounded">
          <h2 className="text-xl mb-4">Upload PDF</h2>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="block w-full mb-2"
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            Upload
          </button>
        </div>
      )}

      {/* Status */}
      {uploadStatus && (
        <div className="mb-8 p-4 border rounded bg-gray-100">
          <h2 className="text-xl mb-2">Status</h2>
          <p>{uploadStatus}</p>
        </div>
      )}

      {/* PDF List */}
      {pdfs.length > 0 && (
        <div className="mb-8 p-4 border rounded">
          <h2 className="text-xl mb-4">Your PDFs</h2>
          <ul className="space-y-2">
            {pdfs.map((pdf: any) => (
              <li key={pdf.id} className="p-2 border rounded">
                <p className="font-bold">{pdf.title}</p>
                <p className="text-sm text-gray-600">{pdf.url}</p>
                <p className="text-sm text-gray-600">Pages: {pdf.pageCount || 'N/A'}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
