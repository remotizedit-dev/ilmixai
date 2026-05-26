import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getNextTicketId } from '../firebase';
import { useAuth } from '../App';
import { Ticket } from '../types';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';

export default function SupportEngineerPanel() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<'all' | 'assigned'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    let q = query(collection(db, 'tickets'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let t = snapshot.docs.map(d => d.data() as Ticket);
      t.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTickets(t);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'tickets');
    });

    return () => unsubscribe();
  }, [userProfile]);

  const filteredTickets = tickets.filter(t => {
     if (filter === 'assigned') return t.assignedTo === userProfile?.userId;
     return true;
  });

  const handleCreateTicket = async () => {
    if (!userProfile || !newEmpId || !newTitle || !newDesc) return;
    try {
      const seqId = await getNextTicketId();
      const newRef = doc(db, 'tickets', seqId);
      await setDoc(newRef, {
        ticketId: seqId,
        title: newTitle,
        description: newDesc,
        employeeId: newEmpId,
        creatorUserId: userProfile.userId,
        creatorName: userProfile.name || "Support Staff",
        status: 'open',
        assignedTo: '',
        createdAt: new Date().toISOString(),
        totalSupportTimeSeconds: 0,
        timerState: 'paused'
      });
      setShowCreateModal(false);
      setNewEmpId('');
      setNewTitle('');
      setNewDesc('');
    } catch(e) {
       handleFirestoreError(e, OperationType.CREATE, 'tickets');
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-fade-in">
      {/* Upper Control Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Support Desk</h2>
          <p className="text-slate-500 mt-1 text-xs">Manage, track and resolve customer tickets efficiently.</p>
        </div>
        
        <div className="flex items-center space-x-3">
           <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button 
                onClick={() => setFilter('all')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filter === 'all' 
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                All Tickets
              </button>
              <button 
                onClick={() => setFilter('assigned')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filter === 'assigned' 
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                Assigned to Me
              </button>
           </div>
           
           <button 
             onClick={() => setShowCreateModal(true)}
             className="flex items-center space-x-2 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-2.5 rounded-xl shadow-md transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
           >
             <Plus className="w-4 h-4" />
             <span>Create Ticket</span>
           </button>
        </div>
      </div>

      {/* Modern Flat Data Grid - Focused 4 Columns */}
      <div className="overflow-x-auto w-full">
         <table className="w-full text-left text-sm text-slate-600 border-collapse">
           <thead className="border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
             <tr>
               <th className="px-4 py-3.5 pb-4 w-24">Ticket ID</th>
               <th className="px-4 py-3.5 pb-4">Title</th>
               <th className="px-4 py-3.5 pb-4 w-44">Created Date</th>
               <th className="px-4 py-3.5 pb-4 w-32">Status</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {filteredTickets.map((ticket, index) => (
               <tr 
                 key={ticket.ticketId} 
                 className="hover:bg-slate-50/70 transition-colors cursor-pointer animate-fade-in h-14"
                 style={{ animationDelay: `${index * 0.03}s` }}
                 onClick={() => navigate(`/dashboard/ticket/${ticket.ticketId}`)}
               >
                 <td className="px-4 py-3 font-mono text-xs text-slate-400 font-bold">#{ticket.ticketId.slice(0,8).toUpperCase()}</td>
                 <td className="px-4 py-3 font-bold text-slate-900 text-sm truncate max-w-xl">{ticket.title}</td>
                 <td className="px-4 py-3 text-xs text-slate-500 font-semibold">
                    {new Date(ticket.createdAt).toLocaleDateString(undefined, { 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                 </td>
                 <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 text-[9px] uppercase font-extrabold rounded-full border inline-block tracking-wider ${
                      ticket.status === 'open' ? 'bg-green-50 text-green-700 border-green-200' :
                      ticket.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      ticket.status === 'resolved' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                      'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                 </td>
               </tr>
             ))}
             {filteredTickets.length === 0 && (
               <tr>
                 <td colSpan={4} className="px-4 py-12 text-center text-slate-400 text-xs font-medium">
                   No tickets match the current filters.
                 </td>
               </tr>
             )}
           </tbody>
         </table>
      </div>

      {/* Manual Ticket Creation Sheet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-8 animate-scale-up">
               <h3 className="text-md font-bold text-slate-900 uppercase tracking-wider mb-2">Create Support Ticket</h3>
               <p className="text-slate-500 text-xs mb-6 font-medium">Create a manual ticketing case for internal processing.</p>
               <div className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Employee ID <span className="text-red-600">*</span></label>
                     <input 
                       type="text" 
                       placeholder="e.g. 1003"
                       value={newEmpId} onChange={e => setNewEmpId(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 transition-all font-mono"
                     />
                  </div>
                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-600">*</span></label>
                     <input 
                       type="text" 
                       placeholder="Brief issue title..."
                       value={newTitle} onChange={e => setNewTitle(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 transition-all"
                     />
                  </div>
                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description <span className="text-red-600">*</span></label>
                     <textarea 
                       rows={4}
                       placeholder="Provide extensive detail about the problem..."
                       value={newDesc} onChange={e => setNewDesc(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 resize-none transition-all"
                     />
                  </div>
                  <div className="pt-4 flex items-center justify-end space-x-3">
                     <button 
                       onClick={() => setShowCreateModal(false)} 
                       className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                     >
                       Cancel
                     </button>
                     <button 
                       onClick={handleCreateTicket} 
                       disabled={!newEmpId || !newTitle || !newDesc}
                       className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-[#0f172a] hover:bg-[#1e293b] shadow-md rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                     >
                       Create Ticket
                     </button>
                  </div>
               </div>
            </div>
        </div>
      )}
    </div>
  );
}
