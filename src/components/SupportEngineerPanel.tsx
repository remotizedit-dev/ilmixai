import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getNextTicketId } from '../firebase';
import { useAuth } from '../App';
import { Ticket, User, PendingUser } from '../types';
import { useNavigate } from 'react-router';
import { Plus, Search, Upload, FileText, Loader2, Calendar, Filter, X } from 'lucide-react';

export default function SupportEngineerPanel() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<'all' | 'assigned'>('all');
  
  // Dashboard Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Employees List & Map for Picker & Auto-fetch
  const [employeesList, setEmployeesList] = useState<{ employeeId: string; name: string }[]>([]);
  const [employeeMap, setEmployeeMap] = useState<Record<string, string>>({});
  const [empSearchQuery, setEmpSearchQuery] = useState('');

  // Manual Ticket Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCreatedAt, setNewCreatedAt] = useState('');

  // OCR Upload State
  const [isAnalyzingDoc, setIsAnalyzingDoc] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrEmpId, setOcrEmpId] = useState('');
  const [ocrTitle, setOcrTitle] = useState('');
  const [ocrDesc, setOcrDesc] = useState('');
  const [ocrCreatedAt, setOcrCreatedAt] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'tickets'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let t = snapshot.docs.map(d => d.data() as Ticket);
      t.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTickets(t);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'tickets');
    });

    return () => unsubscribe();
  }, [userProfile]);

  useEffect(() => {
    let unsubUsers: any;
    let unsubPending: any;

    const map: Record<string, string> = {};
    const empList: { employeeId: string; name: string }[] = [];
    const seenIds = new Set<string>();

    unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      snap.docs.forEach(d => {
        const u = d.data() as User;
        if (u.employeeId) {
          if (u.name) map[u.employeeId] = u.name;
          if (!seenIds.has(u.employeeId)) {
            seenIds.add(u.employeeId);
            empList.push({ employeeId: u.employeeId, name: u.name || u.email });
          }
        }
      });
      setEmployeeMap({ ...map });
      setEmployeesList([...empList].sort((a, b) => a.employeeId.localeCompare(b.employeeId)));
    });

    unsubPending = onSnapshot(collection(db, 'pending_users'), (snap) => {
      snap.docs.forEach(d => {
        const p = d.data() as PendingUser;
        if (p.employeeId) {
          if (p.name && !map[p.employeeId]) map[p.employeeId] = p.name || p.email;
          if (!seenIds.has(p.employeeId)) {
            seenIds.add(p.employeeId);
            empList.push({ employeeId: p.employeeId, name: p.name || p.email });
          }
        }
      });
      setEmployeeMap({ ...map });
      setEmployeesList([...empList].sort((a, b) => a.employeeId.localeCompare(b.employeeId)));
    });

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubPending) unsubPending();
    };
  }, []);

  const filteredTickets = tickets.filter(t => {
     if (filter === 'assigned' && t.assignedTo !== userProfile?.userId) return false;
     if (statusFilter !== 'all' && t.status !== statusFilter) return false;

     if (dateFilter !== 'all') {
       const created = new Date(t.createdAt).getTime();
       const now = Date.now();
       if (dateFilter === 'today') {
         const todayStart = new Date();
         todayStart.setHours(0, 0, 0, 0);
         if (created < todayStart.getTime()) return false;
       } else if (dateFilter === '7days') {
         if (now - created > 7 * 24 * 60 * 60 * 1000) return false;
       } else if (dateFilter === '30days') {
         if (now - created > 30 * 24 * 60 * 60 * 1000) return false;
       }
     }

     if (searchQuery.trim()) {
       const q = searchQuery.toLowerCase();
       const matchesId = t.ticketId.toLowerCase().includes(q);
       const matchesTitle = t.title.toLowerCase().includes(q);
       const matchesDesc = t.description.toLowerCase().includes(q);
       const matchesEmp = t.employeeId.toLowerCase().includes(q);
       const matchesName = (t.creatorName || '').toLowerCase().includes(q);
       if (!matchesId && !matchesTitle && !matchesDesc && !matchesEmp && !matchesName) return false;
     }

     return true;
  });

  const handleCreateTicket = async () => {
    if (!userProfile || !newEmpId || !newTitle || !newDesc) return;
    try {
      const seqId = await getNextTicketId();
      const newRef = doc(db, 'tickets', seqId);
      const creationTimestamp = newCreatedAt ? new Date(newCreatedAt).toISOString() : new Date().toISOString();

      await setDoc(newRef, {
        ticketId: seqId,
        title: newTitle,
        description: newDesc,
        employeeId: newEmpId,
        creatorUserId: userProfile.userId,
        creatorName: userProfile.name || "Support Staff",
        status: 'open',
        assignedTo: '',
        createdAt: creationTimestamp,
        totalSupportTimeSeconds: 0,
        timerState: 'paused'
      });

      setShowCreateModal(false);
      setNewEmpId('');
      setNewTitle('');
      setNewDesc('');
      setNewCreatedAt('');
      setEmpSearchQuery('');
    } catch(e) {
       handleFirestoreError(e, OperationType.CREATE, 'tickets');
    }
  };

  const processFileToBase64 = (file: File): Promise<{ base64String: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      if (file.type.startsWith('image/')) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            const base64String = dataUrl.split(',')[1];
            resolve({ base64String, mimeType: 'image/jpeg' });
          } else {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve({ base64String: result.split(',')[1], mimeType: file.type });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }
        };
        img.onerror = () => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve({ base64String: result.split(',')[1], mimeType: file.type });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        };
        img.src = url;
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve({ base64String: result.split(',')[1], mimeType: file.type });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingDoc(true);
    setOcrError(null);

    try {
      const { base64String, mimeType } = await processFileToBase64(file);
      const response = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: base64String, mimeType })
      });

      const rawText = await response.text();

      if (!response.ok) {
        if (response.status === 413) {
          setOcrError('Document payload is too large for the server. Please restart your dev server command (npm run dev) so the 50MB body limit takes effect.');
        } else {
          setOcrError(`Server error (${response.status}). Please verify GEMINI_API_KEY.`);
        }
        return;
      }

      let json: any;
      try {
        json = JSON.parse(rawText);
      } catch {
        setOcrError('Server returned non-JSON response. Please restart your dev server (npm run dev).');
        return;
      }

      if (json.status === 'success' && json.data) {
        setOcrEmpId(json.data.employeeId || '');
        setOcrTitle(json.data.title || 'OCR Document Ticket');
        setOcrDesc(json.data.description || '');
        setOcrCreatedAt(json.data.createdAt ? json.data.createdAt.slice(0, 16) : '');
        setShowOcrModal(true);
      } else {
        setOcrError(json.message || 'Failed to extract text from document.');
      }
    } catch (err: any) {
      setOcrError(err.message || 'Error processing document.');
    } finally {
      setIsAnalyzingDoc(false);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateOcrTicket = async () => {
    if (!userProfile || !ocrTitle || !ocrDesc) return;
    try {
      const seqId = await getNextTicketId();
      const newRef = doc(db, 'tickets', seqId);
      const creationTimestamp = ocrCreatedAt ? new Date(ocrCreatedAt).toISOString() : new Date().toISOString();

      await setDoc(newRef, {
        ticketId: seqId,
        title: ocrTitle,
        description: ocrDesc,
        employeeId: ocrEmpId || "Unknown",
        creatorUserId: userProfile.userId,
        creatorName: userProfile.name || "Support Staff",
        status: 'open',
        assignedTo: '',
        createdAt: creationTimestamp,
        totalSupportTimeSeconds: 0,
        timerState: 'paused'
      });

      setShowOcrModal(false);
      setOcrEmpId('');
      setOcrTitle('');
      setOcrDesc('');
      setOcrCreatedAt('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'tickets');
    }
  };

  const filteredEmployeesInModal = employeesList.filter(emp =>
    emp.employeeId.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    emp.name.toLowerCase().includes(empSearchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-fade-in">
      {/* Hidden File Input for OCR */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
      />

      {/* Upper Control Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Support Desk</h2>
          <p className="text-slate-500 mt-1 text-xs">Manage, track and resolve customer tickets efficiently.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
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
             onClick={() => fileInputRef.current?.click()}
             disabled={isAnalyzingDoc}
             className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl shadow-sm transition-all text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
             title="Upload PDF, PNG or JPEG document for AI ticket parsing"
           >
             {isAnalyzingDoc ? (
               <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
             ) : (
               <Upload className="w-4 h-4 text-blue-600" />
             )}
             <span>{isAnalyzingDoc ? 'Analyzing Doc...' : 'OCR Ticket'}</span>
           </button>

           <button 
             onClick={() => setShowCreateModal(true)}
             className="flex items-center space-x-2 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-2.5 rounded-xl shadow-md transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
           >
             <Plus className="w-4 h-4" />
             <span>Create Ticket</span>
           </button>
        </div>
      </div>

      {ocrError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 flex justify-between items-center">
          <span>{ocrError}</span>
          <button onClick={() => setOcrError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Dashboard Search & Filter Toolbar */}
      <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by ID, Title, Employee..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs pl-10 pr-3.5 py-2.5 text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 outline-none focus:border-slate-400 cursor-pointer font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center space-x-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 outline-none focus:border-slate-400 cursor-pointer font-medium"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
          </div>
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
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-8 animate-scale-up max-h-[90vh] overflow-y-auto">
               <h3 className="text-md font-bold text-slate-900 uppercase tracking-wider mb-2">Create Support Ticket</h3>
               <p className="text-slate-500 text-xs mb-6 font-medium">Create a manual ticketing case for internal processing.</p>
               <div className="space-y-4">
                  {/* Searchable Employee Selector */}
                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Employee <span className="text-red-600">*</span></label>
                     <div className="space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                          <input 
                            type="text"
                            value={empSearchQuery}
                            onChange={(e) => setEmpSearchQuery(e.target.value)}
                            placeholder="Search employee ID or name..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-9 text-xs text-slate-900 outline-none focus:border-slate-400"
                          />
                        </div>
                        <select 
                          value={newEmpId} 
                          onChange={e => setNewEmpId(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:border-slate-400 outline-none text-slate-900 font-mono cursor-pointer"
                        >
                          <option value="">Select Employee...</option>
                          {filteredEmployeesInModal.map(emp => (
                            <option key={emp.employeeId} value={emp.employeeId}>
                              {emp.employeeId} - {emp.name}
                            </option>
                          ))}
                          <option value="__custom__">+ Custom Employee ID...</option>
                        </select>
                        {newEmpId && newEmpId !== '__custom__' && (
                          <div className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 mt-1 flex items-center justify-between">
                            <span>Employee Name:</span>
                            <span className="font-bold">{employeeMap[newEmpId] || "Unregistered Employee ID"}</span>
                          </div>
                        )}
                     </div>
                  </div>

                  {newEmpId === '__custom__' && (
                     <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Enter Custom Employee ID <span className="text-red-600">*</span></label>
                        <input 
                          type="text" 
                          placeholder="e.g. 1003"
                          onChange={e => setNewEmpId(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900 font-mono"
                        />
                     </div>
                  )}

                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title <span className="text-red-600">*</span></label>
                     <input 
                       type="text" 
                       placeholder="Brief issue title..."
                       value={newTitle} onChange={e => setNewTitle(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900 transition-all"
                     />
                  </div>

                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description <span className="text-red-600">*</span></label>
                     <textarea 
                       rows={4}
                       placeholder="Provide extensive detail about the problem..."
                       value={newDesc} onChange={e => setNewDesc(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900 resize-none transition-all"
                     />
                  </div>

                  {/* Created Date & Time Picker */}
                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Created Date & Time (Optional)</label>
                     <input 
                       type="datetime-local"
                       value={newCreatedAt}
                       onChange={e => setNewCreatedAt(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900 cursor-pointer"
                     />
                     <span className="text-[10px] text-slate-400 mt-1 block">Leave empty to use current system date and time.</span>
                  </div>

                  <div className="pt-4 flex items-center justify-end space-x-3">
                     <button 
                       onClick={() => {
                         setShowCreateModal(false);
                         setEmpSearchQuery('');
                       }} 
                       className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                     >
                       Cancel
                     </button>
                     <button 
                       onClick={handleCreateTicket} 
                       disabled={!newEmpId || newEmpId === '__custom__' || !newTitle || !newDesc}
                       className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-[#0f172a] hover:bg-[#1e293b] shadow-md rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                     >
                       Create Ticket
                     </button>
                  </div>
               </div>
            </div>
        </div>
      )}

      {/* OCR Ticket Review & Edit Dialog */}
      {showOcrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg p-8 animate-scale-up max-h-[90vh] overflow-y-auto">
               <div className="flex items-center space-x-2 text-blue-600 mb-2">
                 <FileText className="w-5 h-5" />
                 <h3 className="text-md font-bold text-slate-900 uppercase tracking-wider">Gemini OCR Ticket Review</h3>
               </div>
               <p className="text-slate-500 text-xs mb-6 font-medium">Review and edit the extracted details from your document before creating the ticket.</p>

               <div className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Extracted Employee ID</label>
                     <input 
                       type="text" 
                       value={ocrEmpId} 
                       onChange={e => setOcrEmpId(e.target.value)}
                       placeholder="e.g. 1003"
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900 font-mono"
                     />
                     {ocrEmpId && (
                       <div className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 mt-1.5 flex items-center justify-between">
                         <span>Employee Name:</span>
                         <span className="font-bold">{employeeMap[ocrEmpId] || "Unregistered Employee ID"}</span>
                       </div>
                     )}
                  </div>

                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Extracted Title <span className="text-red-600">*</span></label>
                     <input 
                       type="text" 
                       value={ocrTitle} 
                       onChange={e => setOcrTitle(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900"
                     />
                  </div>

                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Extracted Description <span className="text-red-600">*</span></label>
                     <textarea 
                       rows={5}
                       value={ocrDesc} 
                       onChange={e => setOcrDesc(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900 resize-none"
                     />
                  </div>

                  <div>
                     <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Created Date & Time</label>
                     <input 
                       type="datetime-local"
                       value={ocrCreatedAt}
                       onChange={e => setOcrCreatedAt(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 outline-none text-slate-900 cursor-pointer"
                     />
                  </div>

                  <div className="pt-4 flex items-center justify-end space-x-3">
                     <button 
                       onClick={() => setShowOcrModal(false)} 
                       className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                     >
                       Cancel
                     </button>
                     <button 
                       onClick={handleCreateOcrTicket} 
                       disabled={!ocrTitle || !ocrDesc}
                       className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 shadow-md rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                     >
                       Confirm & Create Ticket
                     </button>
                  </div>
               </div>
            </div>
        </div>
      )}
    </div>
  );
}
