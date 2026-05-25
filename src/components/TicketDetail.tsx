import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, updateDoc, setDoc } from 'firebase/firestore';
import { Ticket, Comment, User } from '../types';
import { useAuth } from '../App';
import { ArrowLeft, Clock, Send, Shield, User as UserIcon } from 'lucide-react';

export default function TicketDetail() {
  const { ticketId } = useParams();
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<User[]>([]);

  // Load ticket
  useEffect(() => {
    if (!ticketId || !userProfile) return;

    const ticketRef = doc(db, 'tickets', ticketId);
    const unsubscribeTicket = onSnapshot(ticketRef, (docSnap) => {
      if (docSnap.exists()) {
         setTicket(docSnap.data() as Ticket);
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `tickets/${ticketId}`);
    });

    const q = userProfile.role === 'end_user'
      ? query(collection(db, 'tickets', ticketId, 'comments'), where('isInternal', '==', false))
      : query(collection(db, 'tickets', ticketId, 'comments'));

    const unsubscribeComments = onSnapshot(q, (snapshot) => {
      const c = snapshot.docs.map(d => d.data() as Comment);
      c.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      // Client-side filtering just in case rules are leaky, but rules should restrict
      const filtered = c.filter(comment => 
        userProfile.role !== 'end_user' || !comment.isInternal
      );
      
      setComments(filtered);
    }, (err) => {
      // Don't throw to screen on comment load failure if rules just block.
      console.error(err);
    });

    let unsubscribeUsers: any = null;
    if (userProfile.role !== 'end_user') {
        unsubscribeUsers = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['support_engineer', 'super_admin', 'alt_admin'])), (snap) => {
            setUsers(snap.docs.map(d => d.data() as User));
        });
    }

    return () => {
      unsubscribeTicket();
      unsubscribeComments();
      if (unsubscribeUsers) unsubscribeUsers();
    };
  }, [ticketId, userProfile]);

  const handleCreateComment = async () => {
    if (!newComment.trim() || !ticketId || !userProfile) return;
    
    try {
      const commentRef = doc(collection(db, 'tickets', ticketId, 'comments'));
      
      await setDoc(commentRef, {
        commentId: commentRef.id,
        ticketId,
        userId: userProfile.userId,
        authorName: userProfile.name,
        text: newComment.trim(),
        isInternal: isInternal && userProfile.role !== 'end_user',
        createdAt: new Date().toISOString()
      });
      
      setNewComment('');
      setIsInternal(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `tickets/${ticketId}/comments`);
    }
  };

  const handleUpdateAssignment = async (newAssignee: string) => {
     if (!ticket || !userProfile || userProfile.role === 'end_user') return;
     try {
       await updateDoc(doc(db, 'tickets', ticket.ticketId), {
         assignedTo: newAssignee,
         updatedAt: new Date().toISOString()
       });
     } catch(e) {
       handleFirestoreError(e, OperationType.UPDATE, `tickets/${ticket.ticketId}`);
     }
  };

  const handleUpdateStatus = async (newStatus: Ticket['status']) => {
     if (!ticket || !userProfile || userProfile.role === 'end_user') return;
     try {
       const updates: any = {
         status: newStatus,
         updatedAt: new Date().toISOString()
       };
       if (newStatus === 'closed') {
         updates.closedAt = new Date().toISOString();
       }
       await updateDoc(doc(db, 'tickets', ticket.ticketId), updates);
     } catch(e) {
       handleFirestoreError(e, OperationType.UPDATE, `tickets/${ticket.ticketId}`);
     }
  };

  const handleTimerToggle = async () => {
     if (!ticket || !userProfile || userProfile.role === 'end_user') return;
     const now = new Date();
     try {
       let updates: Partial<Ticket> = {};
       if (ticket.timerState === 'paused') {
           updates = {
              timerState: 'running',
              timerLastStartedAt: now.toISOString()
           };
       } else {
           const startedAt = new Date(ticket.timerLastStartedAt);
           const diffSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
           updates = {
              timerState: 'paused',
              totalSupportTimeSeconds: (ticket.totalSupportTimeSeconds || 0) + diffSeconds
           }
       }
       await updateDoc(doc(db, 'tickets', ticket.ticketId), updates);
     } catch (e) {
       handleFirestoreError(e, OperationType.UPDATE, `tickets/${ticket.ticketId}`);
     }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading ticket...</div>;
  if (!ticket) return <div className="p-8 text-slate-500">Ticket not found or access denied.</div>;

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between sticky top-0 z-10 gap-4">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">{ticket.title}</h1>
            <p className="text-sm text-slate-400 font-mono mt-0.5">Ticket #{ticket.ticketId.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {userProfile?.role !== 'end_user' && (
            <>
               <div className="flex items-center space-x-2 bg-black/40 rounded-xl p-1 border border-white/10">
                 <button 
                   onClick={handleTimerToggle}
                   className={`px-3 py-1.5 text-[11px] uppercase font-bold tracking-wider rounded-lg transition-all ${ticket.timerState === 'running' ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                 >
                   {ticket.timerState === 'running' ? 'Pause Timer' : 'Start Timer'}
                 </button>
                 <div className="px-3 py-1.5 text-sm font-mono text-slate-300 flex items-center">
                    <Clock className="w-4 h-4 mr-1.5 opacity-50" />
                    {Math.floor((ticket.totalSupportTimeSeconds || 0) / 60)}m {(ticket.totalSupportTimeSeconds || 0) % 60}s
                 </div>
               </div>
               <select 
                 className="bg-black/40 border border-white/10 rounded-xl text-sm px-4 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500 appearance-none [&>option]:text-black"
                 value={ticket.assignedTo}
                 onChange={(e) => handleUpdateAssignment(e.target.value)}
               >
                 <option value="">Unassigned</option>
                 {users.map(u => <option key={u.userId} value={u.userId}>{u.name} (EMP-{u.employeeId})</option>)}
               </select>
               <select 
                 className="bg-blue-500/10 border border-blue-500/30 text-blue-400 font-medium rounded-xl text-sm px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 appearance-none [&>option]:text-black"
                 value={ticket.status}
                 onChange={(e) => handleUpdateStatus(e.target.value as Ticket['status'])}
               >
                 <option value="open">Open</option>
                 <option value="in_progress">In Progress</option>
                 <option value="resolved">Resolved</option>
                 <option value="closed">Closed</option>
               </select>
            </>
          )}
          {userProfile?.role === 'end_user' && (
             <span className="px-3 py-1 bg-white/10 border border-white/10 rounded-full text-[10px] uppercase font-bold tracking-wider text-slate-300">
                {ticket.status.replace('_', ' ')}
             </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 flex flex-col space-y-6 max-w-5xl mx-auto w-full">
        <div className="bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-6 shadow-xl">
           <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
           <div className="mt-4 flex flex-wrap gap-4 text-[10px] uppercase tracking-widest text-slate-500 font-medium">
             {ticket.creatorName && <span>User Name: {ticket.creatorName}</span>}
             <span>Creator ID: {ticket.creatorUserId.slice(0, 8)}</span>
             <span>EMP ID: {ticket.employeeId}</span>
             <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
           </div>
        </div>

        <div className="space-y-4 flex-1">
           {comments.map(comment => (
              <div key={comment.commentId} className={`flex ${comment.userId === userProfile?.userId ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[85%] rounded-3xl px-6 py-4 shadow-xl backdrop-blur-sm ${
                    comment.isInternal ? 'bg-orange-500/20 border border-orange-500/30 text-orange-200 rounded-tl-sm' : 
                    comment.userId === userProfile?.userId ? 'bg-blue-600/80 border border-blue-500/50 text-white rounded-tr-sm' : 
                    'bg-white/10 border border-white/10 text-slate-200 rounded-tl-sm'
                 }`}>
                    <div className="flex items-center space-x-2 mb-2">
                       <span className={`text-xs font-bold tracking-wide ${comment.userId === userProfile?.userId && !comment.isInternal ? 'text-blue-200' : 'text-slate-400'}`}>
                          {comment.authorName}
                       </span>
                       {comment.isInternal && (
                          <span className="flex items-center text-[9px] uppercase font-bold tracking-widest text-orange-300 bg-orange-500/30 px-2 py-0.5 rounded-full border border-orange-500/30">
                             <Shield className="w-3 h-3 mr-1" /> Internal
                          </span>
                       )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{comment.text}</p>
                    <div className={`text-[10px] uppercase tracking-wider font-medium mt-3 text-right ${comment.userId === userProfile?.userId && !comment.isInternal ? 'text-blue-300' : 'text-slate-500'}`}>
                       {new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                 </div>
              </div>
           ))}
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border-t border-white/10 p-5 sticky bottom-0">
         <div className="max-w-5xl mx-auto">
             {userProfile?.role !== 'end_user' && (
                <div className="mb-3 flex items-center">
                   <label className="flex items-center space-x-2 text-sm font-medium text-slate-400 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isInternal} 
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 text-orange-500 focus:ring-orange-500"
                      />
                      <span>Add as Internal Note</span>
                   </label>
                </div>
             )}
             <div className="flex items-end space-x-3 gap-2">
                <textarea 
                   rows={2}
                   value={newComment}
                   onChange={e => setNewComment(e.target.value)}
                   className={`flex-1 rounded-2xl border p-4 text-sm focus:outline-none focus:ring-2 resize-none shadow-inner ${isInternal ? 'bg-orange-900/30 border-orange-500/50 text-orange-100 placeholder-orange-200/50 focus:ring-orange-500/50' : 'bg-black/40 border-white/10 text-white placeholder-slate-500 focus:ring-blue-500/50'}`}
                   placeholder={isInternal ? "Write an internal note (only visible to staff)..." : "Write a reply..."}
                />
                <button 
                  onClick={handleCreateComment}
                  disabled={!newComment.trim()}
                  className={`p-4 rounded-2xl text-white transition-all disabled:opacity-50 flex-shrink-0 shadow-xl ${isInternal ? 'bg-orange-500 hover:bg-orange-400' : 'bg-blue-500 hover:bg-blue-400'}`}
                >
                  <Send className="w-5 h-5" />
                </button>
             </div>
         </div>
      </div>
    </div>
  );
}
