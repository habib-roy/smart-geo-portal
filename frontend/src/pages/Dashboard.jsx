import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  LayoutDashboard, 
  Upload, 
  Map as MapIcon, 
  Database, 
  Users, 
  LogOut, 
  Plus, 
  FileJson, 
  Check, 
  X,
  Loader2,
  Trash2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [dataList, setDataList] = useState([]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
    
    // Polling jika ada data yang sedang 'processing'
    const interval = setInterval(() => {
      setDataList(prev => {
        const isProcessing = prev.some(item => item.status === 'processing' || item.status === 'pending');
        if (isProcessing) {
          fetchData();
        }
        return prev;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get('http://localhost:8000/data/list');
      setDataList(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', desc);

    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:8000/data/upload', formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      setShowUpload(false);
      setFile(null);
      setDesc('');
      fetchData();
    } catch (err) {
      alert('Gagal mengunggah file: ' + err.response?.data?.detail || err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (dataId, filename) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data "${filename}"? Tindakan ini permanen.`)) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:8000/data/delete/${dataId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      alert('Gagal menghapus data: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <LayoutDashboard size={24} className="text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">Geo-AI</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 text-white rounded-xl font-medium transition-all">
            <Database size={20} /> Data Management
          </button>
          <button 
            onClick={() => navigate('/map')}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition-all"
          >
            <MapIcon size={20} /> Map Viewer
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition-all">
            <Users size={20} /> User Management
          </button>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="bg-gray-800/50 p-4 rounded-xl mb-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-500 font-bold uppercase">
              {user?.username?.[0] || 'U'}
            </div>
            <div className="truncate">
              <p className="font-medium text-sm text-white truncate">{user?.username || 'Guest'}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role || 'user'}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-medium"
          >
            <LogOut size={18} /> Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Data Management</h1>
            <p className="text-gray-500 text-sm">Kelola GeoJSON dan Shapefile Anda</p>
          </div>
            <button 
              onClick={() => setShowUpload(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-blue-600/20"
            >
              <Plus size={20} /> Upload Baru
            </button>
        </header>

        <div className="px-8 pb-12">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
              <p className="text-gray-500 text-sm mb-1">Total Dataset</p>
              <h3 className="text-3xl font-bold text-white">{dataList.length}</h3>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
              <p className="text-gray-500 text-sm mb-1">Active Users</p>
              <h3 className="text-3xl font-bold text-white">1</h3>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
              <p className="text-gray-500 text-sm mb-1">Server Status</p>
              <h3 className="text-3xl font-bold text-green-500 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Online
              </h3>
            </div>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-800/50 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-400">Nama File</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-400">Status</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-400">Deskripsi</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-400 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {dataList.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                      Belum ada data tersedia. Silakan unggah data baru.
                    </td>
                  </tr>
                ) : (
                  dataList.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-800/50 transition-all group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-600/10 p-2 rounded-lg text-blue-500">
                            <FileJson size={18} />
                          </div>
                          <div>
                            <span className="font-medium text-gray-200 block">{item.filename}</span>
                            {item.status === 'processing' && (
                              <div className="w-32 h-1 bg-gray-800 rounded-full mt-2 overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 transition-all duration-500" 
                                  style={{ width: `${item.progress}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          item.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                          item.status === 'processing' ? 'bg-blue-500/10 text-blue-500 animate-pulse' :
                          item.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                          'bg-gray-700/50 text-gray-400'
                        }`}>
                          {item.status} {item.status === 'processing' ? `(${item.progress}%)` : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {item.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => navigate('/map')}
                            className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                            title="Lihat di Peta"
                          >
                            <ExternalLink size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id, item.filename)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Hapus Data"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-lg">Upload Dataset Geospatial</h3>
              <button 
                onClick={() => !uploading && setShowUpload(false)}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpload} className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Pilih File (GeoJSON / .zip Shapefile)</label>
                <div 
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                    file ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                  }`}
                  onClick={() => document.getElementById('file-input').click()}
                >
                  {file ? (
                    <>
                      <Check className="text-blue-500 w-10 h-10" />
                      <p className="text-blue-400 font-medium">{file.name}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="text-gray-600 w-10 h-10" />
                      <p className="text-gray-400 text-sm">Klik atau tarik file ke sini</p>
                    </>
                  )}
                  <input 
                    id="file-input"
                    type="file" 
                    className="hidden" 
                    onChange={(e) => setFile(e.target.files[0])}
                    accept=".json,.geojson,.zip"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Deskripsi (Opsional)</label>
                <textarea 
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  placeholder="Dataset area..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>
              <button 
                disabled={uploading || !file}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all"
              >
                {uploading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} /> Sedang Mengunggah...
                  </>
                ) : (
                  <>
                    <Upload size={20} /> Simpan Data
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
