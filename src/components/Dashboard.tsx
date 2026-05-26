import { useAuth } from '../App';
import { logout } from '../firebase';
import { LogOut, LayoutDashboard, Ticket, Users, Settings } from 'lucide-react';
import { Routes, Route, Link, useLocation } from 'react-router';
import SuperAdminPanel from './SuperAdminPanel';
import AltAdminPanel from './AltAdminPanel';
import SupportEngineerPanel from './SupportEngineerPanel';
import EndUserPanel from './EndUserPanel';
import TicketDetail from './TicketDetail';

export default function Dashboard() {
  const { userProfile } = useAuth();
  const location = useLocation();

  if (!userProfile) return null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative z-10 w-full bg-transparent">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-50 border-r border-slate-200 flex flex-col z-20 flex-shrink-0 transition-all duration-300">
        <div className="p-6 border-b border-slate-200 flex flex-col justify-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">ilmix <span className="text-blue-600">AI</span></h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 font-bold">by Remotized IT</p>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col space-y-1.5 mt-4">
          <Link 
            to="/dashboard" 
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              location.pathname === '/dashboard' 
                ? 'bg-[#0f172a] text-white font-semibold shadow-[0_4px_12px_rgba(15,23,42,0.15)] scale-[1.01]' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </Link>

          {(userProfile.role === 'super_admin' || userProfile.role === 'alt_admin') && (
            <Link 
              to="/dashboard/users" 
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                location.pathname.includes('/users') 
                  ? 'bg-[#0f172a] text-white font-semibold shadow-[0_4px_12px_rgba(15,23,42,0.15)] scale-[1.01]' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Users</span>
            </Link>
          )}

          {userProfile.role === 'super_admin' && (
            <Link 
              to="/dashboard/settings" 
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                location.pathname.includes('/settings') 
                  ? 'bg-[#0f172a] text-white font-semibold shadow-[0_4px_12px_rgba(15,23,42,0.15)] scale-[1.01]' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </Link>
          )}
        </nav>

        <div className="p-4 mt-auto">
           <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl">
             <div className="flex flex-col truncate pr-2">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Current Session</span>
                <span className="text-sm font-semibold text-slate-900 truncate mt-0.5">{userProfile.name}</span>
             </div>
             <button onClick={logout} className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer" title="Logout">
                <LogOut className="w-4 h-4" />
             </button>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col h-[100dvh]">
        <Routes>
          <Route path="/" element={
            userProfile.role === 'super_admin' ? <SuperAdminPanel /> :
            userProfile.role === 'alt_admin' ? <AltAdminPanel /> :
            userProfile.role === 'support_engineer' ? <SupportEngineerPanel /> :
            <EndUserPanel />
          } />
          
          <Route path="/ticket/:ticketId" element={<TicketDetail />} />
          
          {userProfile.role === 'super_admin' && (
            <>
              <Route path="/settings" element={<SuperAdminPanel view="settings" />} />
              <Route path="/users" element={<SuperAdminPanel view="users" />} />
            </>
          )}

          {userProfile.role === 'alt_admin' && (
            <Route path="/users" element={<AltAdminPanel view="users" />} />
          )}

        </Routes>
      </main>
    </div>
  );
}
