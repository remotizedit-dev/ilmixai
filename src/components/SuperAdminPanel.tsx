import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../App';
import AltAdminPanel from './AltAdminPanel';
import { Settings, Save } from 'lucide-react';
import { SystemSettings } from '../types';

export default function SuperAdminPanel({ view = 'tickets' }: { view?: 'tickets' | 'users' | 'settings' }) {
  const [settings, setSettings] = useState<SystemSettings>({
    geminiApiUrl: '',
    voiceToTextApi: '',
    textToSpeechApi: '',
    elevenlabsAgentId: '',
    initialMessage: 'Hi, I am ilmix AI. How can I help you today?',
    aiInstructions: 'You are a helpful IT support AI agent.',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (view !== 'settings') return;
    const unsub = onSnapshot(doc(db, 'system', 'settings'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as SystemSettings);
      }
    });
    return () => unsub();
  }, [view]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'system', 'settings'), settings);
      // Wait for WS server to pick up changes or notify user
    } catch(e) {
      handleFirestoreError(e, OperationType.UPDATE, 'system/settings');
    }
    setLoading(false);
  };

  if (view === 'tickets' || view === 'users') {
    return <AltAdminPanel view={view} />;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
       <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">System Settings</h2>
          <p className="text-slate-400 mt-1">Configure global AI models, instructions, and integration settings.</p>
       </div>

       <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden text-sm flex flex-col">
          <div className="p-6 border-b border-white/10 flex items-center space-x-3 bg-black/20">
             <Settings className="w-5 h-5 text-blue-400" />
             <h3 className="font-semibold text-white text-base">Model Configuration</h3>
          </div>
          <div className="p-8 space-y-6">
             <div>
                <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Gemini API Model / URL</label>
                <input 
                  type="text" 
                  value={settings.geminiApiUrl} 
                  onChange={e => setSettings({...settings, geminiApiUrl: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
                  placeholder="gemini-3.1-flash-live-preview"
                />
             </div>
             
             <div>
                <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">ElevenLabs Agent ID</label>
                <input 
                  type="text" 
                  value={settings.elevenlabsAgentId || ''} 
                  onChange={e => setSettings({...settings, elevenlabsAgentId: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
                  placeholder="e.g. 2sY6z7..."
                />
             </div>

             <hr className="border-white/10" />

             <div>
                <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Initial Greeting Message</label>
                <input 
                  type="text" 
                  value={settings.initialMessage} 
                  onChange={e => setSettings({...settings, initialMessage: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
                  placeholder="Hello! Can you describe your issue?"
                />
             </div>

             <div>
                <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">AI System Instructions (Prompting & Behavior)</label>
                <textarea 
                  rows={4}
                  value={settings.aiInstructions} 
                  onChange={e => setSettings({...settings, aiInstructions: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500 resize-none font-mono"
                  placeholder="System instructions for the model..."
                />
             </div>

             <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-400 text-white px-6 py-2.5 rounded-full shadow-xl transition-all font-medium disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{loading ? 'Saving...' : 'Save Settings'}</span>
                </button>
             </div>
          </div>
       </div>
    </div>
  );
}
