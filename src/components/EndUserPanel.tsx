import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '../App';
import { Ticket } from '../types';
import { Link } from 'react-router';
import { Plus, MessageSquare } from 'lucide-react';
import VoiceAIPanel from './VoiceAIPanel';

export default function EndUserPanel() {
  const { userProfile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isVoiceAIOpen, setIsVoiceAIOpen] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    const q = query(
      collection(db, 'tickets'),
      where('employeeId', '==', userProfile.employeeId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const t = snapshot.docs.map(doc => doc.data() as Ticket);
      // Sort in memory since we don't want to require a composite index immediately
      t.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTickets(t);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    return () => unsubscribe();
  }, [userProfile]);

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">My Tickets</h2>
          <p className="text-slate-400 mt-1">View and manage your support requests.</p>
        </div>
        
        <button 
          onClick={() => setIsVoiceAIOpen(true)}
          className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-400 text-white px-5 py-2.5 rounded-full shadow-xl transition-all font-medium"
        >
          <span className="animate-pulse">🎙️</span>
          <span>New AI Ticket</span>
        </button>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden">
        {tickets.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <MessageSquare className="w-12 h-12 text-slate-500 mb-3 opacity-50" />
            <p>You have no open tickets.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {tickets.map(ticket => (
              <li key={ticket.ticketId}>
                <Link to={`/dashboard/ticket/${ticket.ticketId}`} className="block p-5 hover:bg-white/5 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-md font-medium text-white">{ticket.title}</h3>
                      <p className="text-sm text-slate-400 mt-1 line-clamp-1">{ticket.description}</p>
                    </div>
                    <span className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-full border ${
                      ticket.status === 'open' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                      ticket.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                      ticket.status === 'resolved' ? 'bg-slate-500/20 text-slate-300 border-slate-500/30' :
                      'bg-slate-500/20 text-slate-400 border-slate-500/30'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">
                    Opened {new Date(ticket.createdAt).toLocaleDateString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isVoiceAIOpen && (
        <VoiceAIPanel onClose={() => setIsVoiceAIOpen(false)} />
      )}
    </div>
  );
}
