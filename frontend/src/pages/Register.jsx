import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { LogIn, UserPlus, MapPin, CheckCircle } from 'lucide-react';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:8000/auth/register', {
        username: username,
        password: password
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setErr('Gagal mendaftar. Username mungkin sudah digunakan.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full py-12 px-8 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-xl mb-4">
            <UserPlus className="text-indigo-500 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Daftar Geo-AI</h1>
          <p className="text-gray-400">Buat akun baru untuk mulai menjelajah</p>
        </div>

        {success && (
          <div className="bg-green-500/10 border border-green-500/50 text-green-500 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
            <CheckCircle size={18} /> Pendaftaran berhasil! Mengalihkan...
          </div>
        )}

        {err && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-2 rounded-lg mb-6 text-sm">
            {err}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1 ml-1">Username</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="roy..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1 ml-1">Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-indigo-600/20"
          >
            <UserPlus size={20} />
            Daftar Sekarang
          </button>
        </form>

        <div className="mt-8 text-center text-gray-500 text-sm">
          Sudah punya akun?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium ml-1 flex items-center justify-center gap-1 mt-1">
            <LogIn size={16} /> Masuk Sekarang
          </Link>
        </div>
      </div>
    </div>
  );
}
