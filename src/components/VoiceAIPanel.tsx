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

    // Dynamically inject the ElevenLabs widget script if not already defined
    let script: HTMLScriptElement | null = null;
    if (!customElements.get('elevenlabs-convai')) {
      script = document.createElement('script');
      script.src = "https://elevenlabs.io/convai-widget/index.js";
      script.async = true;
      script.type = "text/javascript";
      document.body.appendChild(script);
    }

    return () => {
      active = false;
      isClosingRef.current = true;
      if (script && document.body.contains(script)) {
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

  // Effect 3: Shadow DOM style injector to center/wrap the widget inside the circle
  useEffect(() => {
    if (!agentId || loading) return;

    const injectStyles = () => {
      const widget = widgetRef.current || document.querySelector('elevenlabs-convai');
      if (!widget || !widget.shadowRoot) return;

      const shadow = widget.shadowRoot;

      // Check if custom styles are already injected
      if (shadow.getElementById('ilmix-custom-style-tag')) return;

      const style = document.createElement('style');
      style.id = 'ilmix-custom-style-tag';
      style.textContent = `
        /* Center and wrap the widget inside our circular container */
        :host {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
          pointer-events: auto !important;
        }

        /* Force launcher container to be fully transparent but fully clickable and interactive */
        :host > div,
        div[class*="widget-wrapper"]:not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]),
        div[class*="container"]:not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]),
        div[class*="root"]:not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]),
        div[class*="launcher"],
        div[class*="card"]:not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]) {
          background: transparent !important;
          background-color: transparent !important;
          box-shadow: none !important;
          border: none !important;
          width: 100% !important;
          height: 100% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          pointer-events: auto !important;
          visibility: visible !important;
        }

        /* Hide text/labels in launcher card so only the call orb button is visible in the circle */
        :not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]) > span[class*="text"],
        :not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]) > p[class*="text"],
        :not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]) > div[class*="text"],
        :not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]) > div[class*="label"],
        div[class*="launcher"] span,
        div[class*="launcher"] p,
        div[class*="card"]:not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]) span,
        div[class*="card"]:not([class*="dialog"]):not([class*="modal"]):not([class*="terms"]):not([class*="consent"]) p,
        span[class*="action"],
        span[class*="start"] {
          display: none !important;
        }

        /* Target the call button to fill the parent circle wrapper and be clickable */
        button,
        div[class*="call-button"],
        button[class*="button"] {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 50% !important;
          margin: 0 !important;
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          pointer-events: auto !important;
          visibility: visible !important;
        }

        /* Style the voice orb / avatar to fill the container circle */
        canvas,
        svg,
        div[class*="orb"],
        div[class*="avatar"],
        img[class*="avatar"] {
          width: 100% !important;
          height: 100% !important;
          border-radius: 50% !important;
          display: block !important;
        }

        /* Keep terms and dialog overlays fully visible, opaque, and interactive */
        div[class*="dialog-overlay"],
        div[class*="modal-backdrop"],
        div[class*="backdrop"],
        div[class*="dialog-content"],
        div[class*="modal-content"],
        div[class*="terms-modal"],
        div[class*="dialog"],
        div[class*="modal"] {
          opacity: 1 !important;
          visibility: visible !important;
          display: flex !important;
          pointer-events: auto !important;
        }

        /* Terms & conditions dialog overlay style overrides for perfect responsiveness and zero clipping */
        div[class*="dialog-overlay"],
        div[class*="modal-backdrop"],
        div[class*="backdrop"] {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          background-color: rgba(15, 23, 42, 0.75) !important;
          backdrop-filter: blur(4px) !important;
          z-index: 99999 !important;
        }

        div[class*="dialog-content"],
        div[class*="modal-content"],
        div[class*="terms-modal"],
        div[class*="dialog"],
        div[class*="modal"] {
          position: fixed !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: 90% !important;
          max-width: 440px !important;
          max-height: 80vh !important;
          overflow-y: auto !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
          border-radius: 20px !important;
          padding: 28px !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
          flex-direction: column !important;
          z-index: 100000 !important;
          box-sizing: border-box !important;
        }

        /* Restore text visibility in Terms & Conditions modal */
        div[class*="dialog-content"] span,
        div[class*="dialog-content"] p,
        div[class*="dialog-content"] div,
        div[class*="modal-content"] span,
        div[class*="modal-content"] p,
        div[class*="modal-content"] div,
        div[class*="dialog"] span,
        div[class*="dialog"] p,
        div[class*="dialog"] div,
        div[class*="modal"] span,
        div[class*="modal"] p,
        div[class*="modal"] div {
          display: block !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          color: #334155 !important;
          background: transparent !important;
          background-color: transparent !important;
          opacity: 1 !important;
          visibility: visible !important;
        }

        /* Terms & conditions heading style */
        div[class*="dialog-content"] h2,
        div[class*="modal-content"] h2,
        div[class*="dialog"] h2,
        div[class*="modal"] h2 {
          display: block !important;
          font-size: 20px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          margin-bottom: 14px !important;
          background: transparent !important;
          background-color: transparent !important;
          opacity: 1 !important;
          visibility: visible !important;
        }

        /* Ensure buttons inside Terms dialog are completely visible and clickable */
        div[class*="dialog-content"] button,
        div[class*="modal-content"] button,
        div[class*="dialog"] button,
        div[class*="modal"] button {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: #2563eb !important;
          background: #2563eb !important;
          color: #ffffff !important;
          padding: 12px 24px !important;
          border-radius: 12px !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          cursor: pointer !important;
          margin-top: 20px !important;
          width: 100% !important;
          height: auto !important;
          border: none !important;
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }
        
        div[class*="dialog-content"] button:hover,
        div[class*="modal-content"] button:hover,
        div[class*="dialog"] button:hover,
        div[class*="modal"] button:hover {
          background-color: #1d4ed8 !important;
        }

        /* Style cancel/secondary buttons if present to slate color */
        div[class*="dialog-content"] button[class*="secondary"],
        div[class*="modal-content"] button[class*="secondary"],
        div[class*="dialog"] button[class*="cancel"],
        div[class*="modal"] button[class*="cancel"],
        div[class*="dialog-content"] button:first-of-type,
        div[class*="modal-content"] button:first-of-type,
        div[class*="dialog"] button:first-of-type,
        div[class*="modal"] button:first-of-type {
          background-color: #64748b !important;
          background: #64748b !important;
          color: #ffffff !important;
        }

        /* Ensure the final confirmation button is blue and high-contrast */
        div[class*="dialog-content"] button:last-of-type,
        div[class*="modal-content"] button:last-of-type,
        div[class*="dialog"] button:last-of-type,
        div[class*="modal"] button:last-of-type {
          background-color: #2563eb !important;
          background: #2563eb !important;
          color: #ffffff !important;
        }
      `;
      shadow.appendChild(style);
      console.log("Injected custom CSS into ElevenLabs shadow root.");
    };

    const observer = new MutationObserver(() => {
      injectStyles();
    });

    const intervalId = setInterval(() => {
      const widget = widgetRef.current || document.querySelector('elevenlabs-convai');
      if (widget) {
        if (widget.shadowRoot) {
          injectStyles();
          observer.observe(widget.shadowRoot, { childList: true, subtree: true });
          clearInterval(intervalId);
        }
      }
    }, 100);

    return () => {
      clearInterval(intervalId);
      observer.disconnect();
    };
  }, [agentId, loading]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-lg p-10 relative max-h-[90vh] overflow-y-auto">
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

                    {/* Custom Centered Glowing Microphone Circle Wrapper */}
                    <div className="relative w-28 h-28 flex items-center justify-center bg-slate-950 rounded-full border border-green-500/30 hover:border-green-400/60 shadow-[0_0_20px_rgba(34,197,94,0.15)] hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] transition-all duration-300 group cursor-pointer overflow-visible">
                       
                       {/* Pulsing rings */}
                       <div className="absolute inset-0 bg-green-500/10 rounded-full animate-ping pointer-events-none opacity-40"></div>
                       <div className="absolute -inset-1 bg-gradient-to-tr from-green-500/20 to-emerald-400/20 rounded-full blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                       {/* Central Micro Orb */}
                       <div className="absolute inset-2 bg-slate-900 border border-green-500/40 rounded-full flex flex-col items-center justify-center space-y-1 z-10 transition-transform duration-300 group-hover:scale-105 shadow-inner">
                          <span className="text-xl animate-bounce">🎙️</span>
                          <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest group-hover:text-green-300 transition-colors">Start Call</span>
                       </div>

                       {/* Invisible ElevenLabs Widget Sitting Exactly On Top to Intercept Click events */}
                       <div className="absolute inset-0 z-20 cursor-pointer overflow-visible">
                          <elevenlabs-convai ref={widgetRef} agent-id={agentId} disable-banner="true"></elevenlabs-convai>
                       </div>

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
