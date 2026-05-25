import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, orderBy, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getNextTicketId } from '../firebase';
import { useAuth } from '../App';
import { Ticket } from '../types';
import { Link } from 'react-router';
import { Search, Filter, Plus } from 'lucide-react';

export default function SupportEngineerPanel() {
  const { userProfile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<'all' | 'assigned'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    let q = query(collection(db, 'tickets'));
    
    // As per firestore rules, staff can list all tickets
    // We filter locally just to handle complex queries without forcing composite indexes on the user right away
    
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
        creatorUserId: userProfile.userId, // Since staff creates it, they are creator
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
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Support Desk</h2>
          <p className="text-slate-400 mt-1">Manage and resolve customer tickets.</p>
        </div>
        
        <div className="flex items-center space-x-3">
           <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
             <button 
               onClick={() => setFilter('all')}
               className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === 'all' ? 'bg-white/10 shadow-sm text-white border border-white/5' : 'text-slate-400 hover:text-white'}`}
             >
               All Tickets
             </button>
             <button 
               onClick={() => setFilter('assigned')}
               className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === 'assigned' ? 'bg-white/10 shadow-sm text-white border border-white/5' : 'text-slate-400 hover:text-white'}`}
             >
               Assigned to Me
             </button>
           </div>
           
           <button 
             onClick={() => setShowCreateModal(true)}
             className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-400 text-white px-5 py-2.5 rounded-full shadow-xl transition-all text-sm font-medium"
           >
             <Plus className="w-4 h-4" />
             <span>New</span>
           </button>
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden">
         <div className="overflow-x-auto">
           <table className="w-full text-left text-sm text-slate-400">
             <thead className="bg-black/20 border-b border-white/10 text-slate-300">
               <tr>
                 <th className="px-6 py-4 font-semibold">Ticket ID</th>
                 <th className="px-6 py-4 font-semibold">Title</th>
                 <th className="px-6 py-4 font-semibold">Employee ID</th>
                 <th className="px-6 py-4 font-semibold">Status</th>
                 <th className="px-6 py-4 font-semibold">Assigned To</th>
                 <th className="px-6 py-4 font-semibold text-right">Time Spent</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-white/5 text-slate-300">
               {filteredTickets.map(ticket => (
                 <tr key={ticket.ticketId} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => window.location.href=`/dashboard/ticket/${ticket.ticketId}`}>
                   <td className="px-6 py-4 font-mono text-xs">{ticket.ticketId.slice(0,8)}</td>
                   <td className="px-6 py-4 font-medium text-white">{ticket.title}</td>
                   <td className="px-6 py-4">{ticket.employeeId}</td>
                   <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-full border ${
                        ticket.status === 'open' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                        ticket.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                        ticket.status === 'resolved' ? 'bg-slate-500/20 text-slate-300 border-slate-500/30' :
                        'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      }`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                   </td>
                   <td className="px-6 py-4 text-xs font-medium">
                     {ticket.assignedTo === userProfile?.userId ? <span className="text-blue-400">Me</span> : ticket.assignedTo ? 'Assigned' : 'Unassigned'}
                   </td>
                   <td className="px-6 py-4 text-right font-mono text-xs opacity-80">
                      {Math.floor((ticket.totalSupportTimeSeconds || 0) / 60)}m {(ticket.totalSupportTimeSeconds || 0) % 60}s
                   </td>
                 </tr>
               ))}
               {filteredTickets.length === 0 && (
                 <tr>
                   <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No tickets found.</td>
                 </tr>
               )}
             </tbody>
           </table>
         </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-8">
              <h3 className="text-lg font-bold text-white mb-6">Create New Ticket</h3>
              <div className="space-y-4">
                 <div>
                    <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Target Employee ID <span className="text-blue-400">*</span></label>
                    <input 
                      type="text" 
                      value={newEmpId} onChange={e => setNewEmpId(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
                    />
                 </div>
                 <div>
                    <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Title <span className="text-blue-400">*</span></label>
                    <input 
                      type="text" 
                      value={newTitle} onChange={e => setNewTitle(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
                    />
                 </div>
                 <div>
                    <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Description <span className="text-blue-400">*</span></label>
                    <textarea 
                      rows={4}
                      value={newDesc} onChange={e => setNewDesc(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500 resize-none"
                    />
                 </div>
                 <div className="pt-4 flex items-center justify-end space-x-3">
                    <button onClick={() => setShowCreateModal(false)} className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white rounded-xl transition-colors">Cancel</button>
                    <button 
                      onClick={handleCreateTicket} 
                      disabled={!newEmpId || !newTitle || !newDesc}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-400 shadow-xl rounded-xl transition-all disabled:opacity-50"
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
