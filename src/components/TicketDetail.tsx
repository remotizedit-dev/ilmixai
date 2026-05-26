import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, collection, query, where, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { Ticket, Comment, User } from '../types';
import { useAuth } from '../App';
import { ArrowLeft, Clock, Send, Shield } from 'lucide-react';

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
      
      const filtered = c.filter(comment => 
        userProfile.role !== 'end_user' || !comment.isInternal
      );
      
      setComments(filtered);
    }, (err) => {
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
    <div className="flex flex-col h-screen bg-transparent">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">{ticket.title}</h1>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-slate-500 font-mono tracking-wider">Ticket #{ticket.ticketId.slice(0, 8).toUpperCase()}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
              <span className={`px-2 py-0.5 text-[9px] uppercase font-extrabold tracking-wider rounded-full border ${
                ticket.status === 'open' ? 'bg-green-50 text-green-700 border-green-200' :
                ticket.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                ticket.status === 'resolved' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Column: Discussion, Description, Reply Form */}
        <div className="flex-1 flex flex-col overflow-y-auto border-r border-slate-200">
          
          {/* Scrollable Panel Area */}
          <div className="flex-1 p-6 lg:p-8 space-y-8 overflow-y-auto">
            {/* Description Card */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-3 animate-slide-up">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Issue Description</span>
              <p className="text-slate-900 text-sm whitespace-pre-wrap leading-relaxed font-sans">{ticket.description}</p>
            </div>

            {/* Conversation Feed */}
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Activity Feed & Comments</h3>
                <span className="text-xs text-slate-400">{comments.length} Comment{comments.length !== 1 ? 's' : ''}</span>
              </div>
              
              <div className="space-y-4">
                {comments.map((comment, index) => (
                  <div 
                    key={comment.commentId} 
                    className={`flex ${comment.userId === userProfile?.userId ? 'justify-end' : 'justify-start'} animate-fade-in`}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm ${
                      comment.isInternal 
                        ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-sm' 
                        : comment.userId === userProfile?.userId 
                          ? 'bg-[#0f172a] border border-slate-800 text-white rounded-tr-sm' 
                          : 'bg-slate-100 border border-slate-200 text-slate-800 rounded-tl-sm'
                    }`}>
                      <div className="flex items-center justify-between gap-4 mb-1.5">
                        <span className={`text-[11px] font-bold tracking-wide ${
                          comment.userId === userProfile?.userId && !comment.isInternal 
                            ? 'text-slate-300' 
                            : 'text-slate-500'
                        }`}>
                          {comment.authorName}
                        </span>
                        {comment.isInternal && (
                          <span className="flex items-center text-[8px] uppercase font-bold tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                            <Shield className="w-2.5 h-2.5 mr-1" /> Internal
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                      <div className={`text-[9px] uppercase tracking-wider font-semibold text-right mt-2 ${
                        comment.userId === userProfile?.userId && !comment.isInternal
                          ? 'text-slate-400'
                          : 'text-slate-400'
                      }`}>
                        {new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                    No comments yet. Start the conversation below.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reply Form Sticky Footer */}
          <div className="bg-slate-50 border-t border-slate-200 p-5 backdrop-blur-md">
            <div className="max-w-4xl mx-auto space-y-3">
              {userProfile?.role !== 'end_user' && (
                <div className="flex items-center">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={isInternal} 
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-slate-200 bg-white text-[#0f172a] focus:ring-[#0f172a]/50 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Flag as Internal Note (Staff Only)</span>
                  </label>
                </div>
              )}
              <div className="flex items-end gap-3">
                <textarea 
                  rows={2}
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className={`flex-1 rounded-xl border p-3.5 text-xs focus:outline-none focus:ring-1 resize-none placeholder-slate-400 ${
                    isInternal 
                      ? 'bg-amber-50/50 border-amber-200 text-amber-900 focus:ring-amber-500/30' 
                      : 'bg-white border-slate-200 text-slate-900 focus:ring-slate-300 focus:border-slate-400'
                  }`}
                  placeholder={isInternal ? "Write a private note only staff members can read..." : "Share an update or ask a question..."}
                />
                <button 
                  onClick={handleCreateComment}
                  disabled={!newComment.trim()}
                  className={`p-3.5 rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-lg cursor-pointer ${
                    isInternal 
                      ? 'bg-amber-600 hover:bg-amber-500' 
                      : 'bg-[#0f172a] hover:bg-[#1e293b]'
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sidebar Metadata Panel */}
        <div className="w-full lg:w-80 bg-slate-50 overflow-y-auto p-6 space-y-6 lg:border-l lg:border-slate-200">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-2">Ticket Options</h2>
          
          {/* Status Select */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
            {userProfile?.role !== 'end_user' ? (
              <select 
                className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2.5 text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 appearance-none cursor-pointer"
                value={ticket.status}
                onChange={(e) => handleUpdateStatus(e.target.value as Ticket['status'])}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            ) : (
              <div className="bg-white border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold capitalize text-slate-900 flex items-center justify-between shadow-sm">
                <span>{ticket.status.replace('_', ' ')}</span>
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              </div>
            )}
          </div>

          {/* Assignee Select */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assignee</label>
            {userProfile?.role !== 'end_user' ? (
              <select 
                className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2.5 text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 appearance-none cursor-pointer"
                value={ticket.assignedTo}
                onChange={(e) => handleUpdateAssignment(e.target.value)}
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.userId} value={u.userId}>
                    {u.name} (EMP-{u.employeeId})
                  </option>
                ))}
              </select>
            ) : (
              <div className="bg-white border border-slate-200 px-3 py-2.5 rounded-xl text-xs text-slate-900 shadow-sm">
                {ticket.assignedTo ? "Assigned Support Agent" : "Awaiting Assignment"}
              </div>
            )}
          </div>

          {/* Stopwatch Time Counter Widget (Support Engineers / Admins only) */}
          {userProfile?.role !== 'end_user' && (
            <div className="space-y-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Time Invested</label>
              <div className="flex items-center justify-between mb-3 bg-slate-50 rounded-xl p-3 border border-slate-100 font-mono text-slate-800 text-sm">
                <div className="flex items-center">
                  <Clock className={`w-4 h-4 mr-2 text-slate-400 ${ticket.timerState === 'running' ? 'animate-pulse text-red-500' : ''}`} />
                  <span>{Math.floor((ticket.totalSupportTimeSeconds || 0) / 60)}m {(ticket.totalSupportTimeSeconds || 0) % 60}s</span>
                </div>
                {ticket.timerState === 'running' && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </div>
              <button 
                onClick={handleTimerToggle}
                className={`w-full py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer ${
                  ticket.timerState === 'running' 
                    ? 'bg-red-50 text-white hover:bg-red-600' 
                    : 'bg-[#0f172a] hover:bg-[#1e293b] text-white shadow-sm'
                }`}
              >
                {ticket.timerState === 'running' ? 'Pause Session' : 'Resume Session'}
              </button>
            </div>
          )}

          {/* Ticket Information */}
          <div className="space-y-3 bg-white border border-slate-200 rounded-2xl p-4 text-xs shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Details</h4>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Employee ID</span>
              <span className="text-slate-900 font-semibold">{ticket.employeeId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Reporter</span>
              <span className="text-slate-900 font-semibold truncate max-w-[140px]" title={ticket.creatorName}>{ticket.creatorName || "Voice Assistant"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Created</span>
              <span className="text-slate-700 font-medium">{new Date(ticket.createdAt).toLocaleDateString()}</span>
            </div>
            {ticket.updatedAt && (
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Last Active</span>
                <span className="text-slate-700 font-medium">{new Date(ticket.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
