import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Info } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getNextTicketId } from '../firebase';
import { useAuth } from '../App';

export default function VoiceAIPanel({ onClose }: { onClose: () => void }) {
  const { userProfile } = useAuth();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticketCreatedId, setTicketCreatedId] = useState<string | null>(null);
  const isClosingRef = useRef(false);
  const widgetRef = useRef<HTMLElement | null>(null);

  // Effect 1: Load config settings and inject script on mount
  useEffect(() => {
    let active = true;

    const loadConfig = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'system', 'settings'));
        if (active) {
          if (settingsSnap.exists() && settingsSnap.data().elevenlabsAgentId) {
            setAgentId(settingsSnap.data().elevenlabsAgentId);
          } else {
            // Fallback to env var
            setAgentId(import.meta.env.VITE_ELEVENLABS_AGENT_ID || null);
          }
        }
      } catch (e) {
        console.error("Failed to load ElevenLabs config:", e);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadConfig();

    // Dynamically inject the ElevenLabs widget script
    const script = document.createElement('script');
    script.src = "https://elevenlabs.io/convai-widget/index.js";
    script.async = true;
    script.type = "text/javascript";
    document.body.appendChild(script);

    return () => {
      active = false;
      isClosingRef.current = true;
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Effect 2: Bind the ElevenLabs client tool triggers directly to the element and document
  useEffect(() => {
    if (!agentId) return;

    let active = true;

    const handleWidgetCall = async (event: any) => {
      const { toolName, parameters } = event.detail;
      console.log("ElevenLabs Widget Call Event Received:", toolName, parameters);

      if (
        toolName === 'createTicket' || 
        toolName === 'create_ticket' || 
        toolName === 'createSupportTicket' || 
        toolName === 'create_support_ticket'
      ) {
        const { employeeId, title, summary, fullName, fullname, userName, username } = parameters;
        const finalName = fullName || fullname || userName || username || userProfile?.name || "Unknown";
        try {
          const seqId = await getNextTicketId();
          const ticketRef = doc(db, 'tickets', seqId);
          await setDoc(ticketRef, {
            ticketId: seqId,
            title: title || "AI Voice Ticket",
            description: summary || "Created via ElevenLabs Conversational AI.",
            employeeId: employeeId || userProfile?.employeeId || "Unknown",
            creatorUserId: userProfile?.userId || "Guest",
            creatorName: finalName,
            status: 'open',
            assignedTo: '',
            createdAt: new Date().toISOString(),
            totalSupportTimeSeconds: 0,
            timerState: 'paused'
          });
          
          if (active) {
            setTicketCreatedId(seqId);
          }

          // Leave modal open briefly to show success feedback, then close
          setTimeout(() => {
            if (active && !isClosingRef.current) onClose();
          }, 4000);
        } catch (e) {
          console.error("Failed to create sequential ticket from widget:", e);
        }
      }
    };

    // Attach listeners to element, document, and window to be absolutely bulletproof
    const widget = widgetRef.current || document.querySelector('elevenlabs-convai');
    if (widget) {
      widget.addEventListener('elevenlabs-convai:call', handleWidgetCall);
      console.log("Attached event listener directly to elevenlabs-convai custom element.");
    }
    
    document.addEventListener('elevenlabs-convai:call', handleWidgetCall);
    window.addEventListener('elevenlabs-convai:call', handleWidgetCall);

    return () => {
      active = false;
      if (widget) {
        widget.removeEventListener('elevenlabs-convai:call', handleWidgetCall);
      }
      document.removeEventListener('elevenlabs-convai:call', handleWidgetCall);
      window.removeEventListener('elevenlabs-convai:call', handleWidgetCall);
    };
  }, [agentId, userProfile, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8 relative overflow-hidden">
         {/* Top Close Button */}
         <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors z-20">
            <X className="w-5 h-5" />
         </button>

         <div className="text-center space-y-6 mt-4 flex flex-col items-center">
             <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">ilmix <span className="text-blue-400">AI</span></h2>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1">by Remotized IT</p>
             </div>

             {loading ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-3">
                   <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
                   <p className="text-xs text-slate-400">Loading AI Agent Configuration...</p>
                </div>
             ) : !agentId ? (
                <div className="py-6 px-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-3 max-w-xs">
                   <Info className="w-8 h-8 text-red-400 mx-auto" />
                   <h3 className="text-sm font-semibold text-white">Agent Not Configured</h3>
                   <p className="text-xs text-slate-400 leading-relaxed">
                      The ElevenLabs Agent ID is not set. Please configure it in the **System Settings** panel under your Admin account.
                   </p>
                </div>
             ) : ticketCreatedId ? (
                <div className="py-6 px-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-center space-y-3 max-w-xs animate-pulse">
                   <span className="text-4xl">🎉</span>
                   <h3 className="text-md font-bold text-white">Ticket Logged!</h3>
                   <p className="text-xs text-green-300 font-semibold font-mono">Ticket ID: #{ticketCreatedId}</p>
                   <p className="text-[10px] text-slate-400 leading-relaxed">
                      Your voice request has been processed and logged. Closing this window now...
                   </p>
                </div>
             ) : (
                <div className="w-full flex flex-col items-center space-y-6">
                   <div className="p-5 bg-white/5 border border-white/10 rounded-2xl text-left space-y-2.5 max-w-sm">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Instructions:</h4>
                      <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1.5 leading-relaxed">
                         <li>Click the green microphone orb below to start talking.</li>
                         <li>Detail your **User Name (Full Name)**, **Employee ID**, a **Ticket Title**, and a **Summary** of the issue.</li>
                         <li>The AI will automatically log the ticket and assign ID starting from **0150**!</li>
                      </ol>
                   </div>

                   {/* Custom ElevenLabs Element */}
                   <div className="relative w-28 h-28 flex items-center justify-center bg-white/5 rounded-full border border-white/10 shadow-inner">
                      <elevenlabs-convai ref={widgetRef} agent-id={agentId}></elevenlabs-convai>
                   </div>
                </div>
             )}

             <div className="pt-2">
                <button 
                  onClick={onClose}
                  className="px-5 py-2.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Close Window
                </button>
             </div>
         </div>
      </div>
    </div>
  );
}
