import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
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
    } catch(e) {
      handleFirestoreError(e, OperationType.UPDATE, 'system/settings');
    }
    setLoading(false);
  };

  if (view === 'tickets' || view === 'users') {
    return <AltAdminPanel view={view} />;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full animate-fade-in">
       <div className="mb-8">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">System Settings</h2>
          <p className="text-white/50 mt-1 text-xs">Configure global AI models, instructions, and integration settings.</p>
       </div>

       <div className="bg-[#091124] border border-white/10 rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
          <div className="p-6 border-b border-white/10 flex items-center space-x-3 bg-white/5">
             <Settings className="w-4 h-4 text-white/50" />
             <h3 className="font-bold text-white text-xs uppercase tracking-wider">Model Configuration</h3>
          </div>
          <div className="p-8 space-y-6">
             <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Gemini API Model / URL</label>
                <input 
                  type="text" 
                  value={settings.geminiApiUrl} 
                  onChange={e => setSettings({...settings, geminiApiUrl: e.target.value})}
                  className="w-full bg-[#030c1e] border border-white/10 rounded-xl p-3.5 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-white placeholder-white/30 transition-all font-mono"
                  placeholder="gemini-3.1-flash-live-preview"
                />
             </div>
             
             <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">ElevenLabs Agent ID</label>
                <input 
                  type="text" 
                  value={settings.elevenlabsAgentId || ''} 
                  onChange={e => setSettings({...settings, elevenlabsAgentId: e.target.value})}
                  className="w-full bg-[#030c1e] border border-white/10 rounded-xl p-3.5 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-white placeholder-white/30 transition-all font-mono"
                  placeholder="e.g. 2sY6z7..."
                />
             </div>

             <hr className="border-white/10" />

             <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">Initial Greeting Message</label>
                <input 
                  type="text" 
                  value={settings.initialMessage} 
                  onChange={e => setSettings({...settings, initialMessage: e.target.value})}
                  className="w-full bg-[#030c1e] border border-white/10 rounded-xl p-3.5 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-white placeholder-white/30 transition-all"
                  placeholder="Hello! Can you describe your issue?"
                />
             </div>

             <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">AI System Instructions (Prompting & Behavior)</label>
                <textarea 
                  rows={6}
                  value={settings.aiInstructions} 
                  onChange={e => setSettings({...settings, aiInstructions: e.target.value})}
                  className="w-full bg-[#030c1e] border border-white/10 rounded-xl p-3.5 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none text-white placeholder-white/30 resize-none font-mono transition-all leading-relaxed"
                  placeholder="System instructions for the model..."
                />
             </div>

             <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
