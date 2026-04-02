import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Map as MapIcon,
  Layers,
  MessageSquare,
  ChevronRight,
  LogOut,
  LayoutDashboard,
  Loader2,
  Bot
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const POPUP_STYLE = `
  .maplibregl-popup-content {
    background: #0f172a !important;
    color: #f8fafc !important;
    border-radius: 12px !important;
    padding: 0 !important;
    border: 1px solid #1e293b !important;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4) !important;
  }
  .maplibregl-popup-tip {
    border-top-color: #0f172a !important;
    border-bottom-color: #0f172a !important;
  }
  .maplibregl-popup-close-button {
    color: #64748b !important;
    padding: 5px 10px !important;
    font-size: 16px !important;
  }
  .maplibregl-popup-close-button:hover {
    background: transparent !important;
    color: #ffffff !important;
  }
`;

export default function MapViewer() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(106.8456); // Jakarta
  const [lat, setLat] = useState(-6.2088);
  const [zoom, setZoom] = useState(10);

  const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
  const MARTIN_URL = import.meta.env.VITE_MARTIN_URL || `http://${window.location.hostname}:3333`;

  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Halo! Saya asisten Smart Geo Portal. Ada yang bisa saya bantu terkait data peta Anda?' }
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [layers, setLayers] = useState([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [mapLoaded, setMapLoaded] = useState(false);
  const [martinStatus, setMartinStatus] = useState('pending'); // 'pending', 'online', 'offline'
  const [apiStatus, setApiStatus] = useState('pending');
  const chatContainerRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, chatLoading]);

  const [activeManualLayers, setActiveManualLayers] = useState(new Set());

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `${API_URL}/map/style.json`,
      center: [lng, lat],
      zoom: zoom
    });

    map.current.on('load', () => {
      console.log('MapLibre loaded');
      setMapLoaded(true);
    });

    // --- POPUP & INTERACTIVITY ---
    map.current.on('click', (e) => {
      const features = map.current.queryRenderedFeatures(e.point);
      if (!features.length) return;

      const feature = features[0];
      const props = feature.properties;

      // Build Table HTML for Properties
      let content = `
        <div style="font-family: sans-serif; min-width: 200px; max-width: 300px; color: #f8fafc; background: #0f172a; border-radius: 12px; overflow: hidden; font-size: 11px;">
          <div style="background: linear-gradient(to right, #2563eb, #4f46e5); padding: 8px 12px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #1e293b;">
             Data Details
          </div>
          <div style="padding: 10px; max-height: 200px; overflow-y: auto;">
             <table style="width: 100%; border-collapse: collapse;">
      `;

      for (const [key, value] of Object.entries(props)) {
        if (key !== 'embedding') { // Skip heavy embedding data
          content += `
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 4px 0; color: #64748b; font-weight: bold; width: 40%; vertical-align: top;">${key}</td>
              <td style="padding: 4px 0 4px 10px; color: #cbd5e1; word-break: break-all;">${value}</td>
            </tr>
          `;
        }
      }

      content += `
             </table>
          </div>
        </div>
      `;

      new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'custom-popup-bg'
      })
        .setLngLat(e.lngLat)
        .setHTML(content)
        .addTo(map.current);
    });

    // Cursor pointer on hover
    map.current.on('mousemove', (e) => {
      const features = map.current.queryRenderedFeatures(e.point);
      map.current.getCanvas().style.cursor = features.length ? 'pointer' : '';
    });

    // Style Live Sync (SSE)
    const eventSource = new EventSource(`${API_URL}/map/style/events`);

    eventSource.onmessage = async (event) => {
      if (event.data === 'reload' && map.current) {
        console.log('Style change detected from Maputnik, syncing...');
        try {
          const response = await fetch(`${API_URL}/map/style.json`);
          const newStyle = await response.json();

          // Simpan daftar layer manual yang sedang aktif sebelum ganti style
          const currentManualLayers = Array.from(activeManualLayers);

          // Update style
          map.current.setStyle(newStyle);

          // Tunggu style selesai dimuat, lalu tambahkan kembali layer manual jika belum ada dalam style baru
          map.current.once('style.load', () => {
            currentManualLayers.forEach(tableName => {
              // Periksa apakah style baru sudah menyertakan layer ini (misal via Maputnik)
              // Jika belum, tambahkan lagi secara manual
              if (!map.current.getSource(tableName)) {
                console.log(`Restoring manual layer: ${tableName}`);
                addLayerToMap(tableName, false); // false = jangan zoom lagi
              }
            });
          });
        } catch (err) {
          console.error('Failed to sync style:', err);
        }
      }
    };

    map.current.on('error', (e) => {
      console.error('MapLibre Error:', e);
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    fetchLayers();
    checkConnectivity();

    return () => {
      eventSource.close();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [API_URL, MARTIN_URL, activeManualLayers]);

  const checkConnectivity = async () => {
    // Check Martin
    try {
      await axios.get(`${MARTIN_URL}/catalog`);
      setMartinStatus('online');
    } catch (e) {
      setMartinStatus('offline');
    }
    // Check Backend
    try {
      await axios.get(`${API_URL}/data/list`);
      setApiStatus('online');
    } catch (e) {
      setApiStatus('offline');
    }
  };

  const fetchLayers = async () => {
    try {
      const res = await axios.get(`${API_URL}/data/list`);
      setLayers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setChatLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/chat?message=${encodeURIComponent(input)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Add empty assistant message to start streaming into it
      setMessages(prev => [...prev, { role: 'assistant', content: '📡 AI sedang berpikir...' }]);

      let firstChunk = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          // Replace "Thinking..." with the first real chunk
          const newContent = firstChunk ? chunk : lastMsg.content + chunk;
          const updatedMsg = { ...lastMsg, content: newContent };
          return [...prev.slice(0, -1), updatedMsg];
        });
        
        if (firstChunk && chunk.trim() !== '') {
          firstChunk = false;
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, terjadi kesalahan saat menghubungi AI.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const addLayerToMap = async (table_name, shouldFly = true) => {
    if (!mapLoaded || !map.current) return;

    try {
      // 1. Ambil metadata TileJSON untuk bound (FitBound)
      const tileJSONUrl = `${MARTIN_URL}/${table_name}`;
      const res = await axios.get(tileJSONUrl);
      const metadata = res.data;

      // FitBound (Penyelesaian Masalah 2: fitbound hilang)
      if (shouldFly && metadata.bounds) {
        map.current.fitBounds(metadata.bounds, {
          padding: 50,
          duration: 2000
        });
      }

      // 2. Jika source sudah ada, tidak perlu tambah lagi
      if (map.current.getSource(table_name)) {
        console.log(`Layer ${table_name} sudah ada di peta.`);
        return;
      }

      // Tambahkan ke daftar manual layer agar persisten saat ganti style
      setActiveManualLayers(prev => new Set(prev).add(table_name));

      // 3. Tambahkan Source dan Layer Universal
      const martinTileUrl = `${MARTIN_URL}/${table_name}/{z}/{x}/{y}`;
      map.current.addSource(table_name, {
        type: 'vector',
        tiles: [martinTileUrl]
      });

      // Renderer Multi-Geometry (Polygon, Line, Point)
      map.current.addLayer({
        id: `${table_name}-fill`,
        type: 'fill',
        source: table_name,
        'source-layer': table_name,
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.4 }
      });

      map.current.addLayer({
        id: `${table_name}-line`,
        type: 'line',
        source: table_name,
        'source-layer': table_name,
        paint: { 'line-color': '#2563eb', 'line-width': 2 }
      });

      map.current.addLayer({
        id: `${table_name}-circle`,
        type: 'circle',
        source: table_name,
        'source-layer': table_name,
        paint: {
          'circle-radius': 5,
          'circle-color': '#3b82f6',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      });

    } catch (e) {
      console.error('Gagal menambah layer:', e);
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <style>{POPUP_STYLE}</style>
      {/* Sidebar Navigation */}
      <div className="w-16 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-6 gap-6">
        <div className="bg-blue-600 p-2 rounded-lg cursor-pointer" onClick={() => navigate('/dashboard')}>
          <LayoutDashboard size={20} className="text-white" />
        </div>
        <div className="bg-gray-800 p-2 rounded-lg cursor-pointer text-gray-400 hover:text-white">
          <MapIcon size={20} />
        </div>
        <div className="mt-auto mb-4 bg-gray-800 p-2 rounded-lg cursor-pointer text-red-400 hover:text-red-300" onClick={logout}>
          <LogOut size={20} />
        </div>
      </div>

      {/* Map Content */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

        {/* Layer Panel Overlay */}
        <div className="absolute top-6 left-6 w-64 flex flex-col gap-4">
          <div className="bg-gray-900/90 backdrop-blur-md border border-gray-800 rounded-2xl shadow-2xl p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Layers size={18} className="text-blue-500" />
              <h3 className="font-bold text-white text-sm">Active Layers</h3>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {layers.length === 0 ? (
                <p className="text-gray-500 text-[10px] italic">Belum ada data...</p>
              ) : (
                layers.map(layer => (
                  <button
                    key={layer.id}
                    onClick={() => addLayerToMap(layer.table_name)}
                    className="w-full text-left bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-[10px] flex items-center justify-between group transition-all"
                  >
                    <span className="truncate max-w-[150px]">{layer.filename}</span>
                    <ChevronRight size={12} className="text-gray-600 group-hover:text-white rotate-0 group-hover:rotate-90 transition-transform" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Status Panel */}
          <div className="bg-gray-900/80 backdrop-blur-md border border-gray-800 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-tighter">
              <span className="text-gray-500 font-bold">Martin Tiles</span>
              <div className="flex items-center gap-1.5 font-bold">
                <div className={`w-2 h-2 rounded-full ${martinStatus === 'online' ? 'bg-green-500' : martinStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                <span className={martinStatus === 'online' ? 'text-green-500' : martinStatus === 'offline' ? 'text-red-500' : 'text-yellow-500'}>{martinStatus}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-tighter">
              <span className="text-gray-500 font-bold">Smart Geo Portal Backend</span>
              <div className="flex items-center gap-1.5 font-bold">
                <div className={`w-2 h-2 rounded-full ${apiStatus === 'online' ? 'bg-green-500' : apiStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                <span className={apiStatus === 'online' ? 'text-green-500' : apiStatus === 'offline' ? 'text-red-500' : 'text-yellow-500'}>{apiStatus}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat Sidebar */}
      <aside className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col">
        <header className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded-xl">
              <Bot size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">Smart Geo Portal Assistant</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Online</span>
              </div>
            </div>
          </div>
        </header>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700'
                }`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ node, ...props }) => <table className="border-collapse border border-gray-700 my-2 w-full" {...props} />,
                      th: ({ node, ...props }) => <th className="border border-gray-700 px-2 py-1 bg-gray-900" {...props} />,
                      td: ({ node, ...props }) => <td className="border border-gray-700 px-2 py-1" {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 text-gray-400 px-4 py-3 rounded-2xl rounded-tl-none border border-gray-700 flex items-center gap-2 text-sm italic">
                <Loader2 className="animate-spin" size={16} /> Sedang merespon...
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-800">
          <form onSubmit={handleSendMessage} className="relative">
            <input
              type="text"
              className="w-full bg-gray-950 border border-gray-800 rounded-2xl pl-12 pr-12 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="Tanya apapun tentang peta..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={chatLoading}
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
              <MessageSquare size={18} />
            </div>
            <button
              type="submit"
              disabled={chatLoading || !input.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 p-2 rounded-xl text-white transition-all shadow-lg shadow-blue-600/20"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="text-[10px] text-gray-600 mt-3 text-center">
            AI dapat melakukan kesalahan. Harap periksa kembali informasi penting.
          </p>
        </div>
      </aside>
    </div>
  );
}
