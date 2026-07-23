import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../App';
import { Ticket } from '../types';
import { useNavigate } from 'react-router';
import { MessageSquare, Search, Filter, Calendar } from 'lucide-react';
import VoiceAIPanel from './VoiceAIPanel';

export default function EndUserPanel() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isVoiceAIOpen, setIsVoiceAIOpen] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  useEffect(() => {
    if (!userProfile) return;
    const q = query(
      collection(db, 'tickets'),
      where('employeeId', '==', userProfile.employeeId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const t = snapshot.docs.map(doc => doc.data() as Ticket);
      t.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTickets(t);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    return () => unsubscribe();
  }, [userProfile]);

  const filteredTickets = tickets.filter(t => {
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
       if (!matchesId && !matchesTitle && !matchesDesc) return false;
     }

     return true;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto w-full animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Support Tickets</h2>
          <p className="text-slate-500 mt-1 text-xs">View and manage your registered hardware, network, or IT support cases.</p>
        </div>

        <button
          onClick={() => setIsVoiceAIOpen(true)}
          className="flex items-center justify-center space-x-2.5 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-2.5 rounded-xl shadow-md transition-all text-xs font-bold uppercase tracking-wider cursor-pointer md:w-auto w-full"
        >
          <span className="animate-pulse text-base">🎙️</span>
          <span>New AI Voice Ticket</span>
        </button>
      </div>

      {/* Dashboard Search & Filter Toolbar */}
      <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search my tickets by ID or title..."
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

      {/* Flat Data Grid - Focused 4 Columns */}
      <div className="w-full">
        {tickets.length === 0 ? (
          <div className="p-16 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-4 shadow-sm">
            <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400">
              <MessageSquare className="w-5 h-5 opacity-70" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">No tickets opened</p>
              <p className="text-xs text-slate-400">Log a new case using the voice assistant or contact support.</p>
            </div>
          </div>
        ) : (
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
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 font-bold">#{ticket.ticketId.slice(0, 8).toUpperCase()}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 text-sm truncate max-w-xl">{ticket.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-semibold">
                      {new Date(ticket.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 text-[9px] uppercase font-extrabold rounded-full border inline-block tracking-wider ${ticket.status === 'open' ? 'bg-green-50 text-green-700 border-green-200' :
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
                      No tickets match the search or filter parameters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isVoiceAIOpen && (
        <VoiceAIPanel onClose={() => setIsVoiceAIOpen(false)} />
      )}
    </div>
  );
}
