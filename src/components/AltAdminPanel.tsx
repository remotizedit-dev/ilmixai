import { useState, useEffect } from 'react';
import SupportEngineerPanel from './SupportEngineerPanel';
import { collection, query, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PendingUser } from '../types';
import { useAuth } from '../App';
import { Mail, Plus, Trash2, Pencil, User as UserIcon } from 'lucide-react';

export default function AltAdminPanel({ view = 'tickets' }: { view?: 'tickets' | 'users' }) {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<PendingUser['role']>('end_user');
  const [newEmpId, setNewEmpId] = useState('');

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (view !== 'users') return;
    const q = query(collection(db, 'pending_users'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => d.data() as PendingUser));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'pending_users');
    });
    return () => unsubscribe();
  }, [view]);

  const openAddModal = () => {
    setIsEditing(false);
    setNewEmail('');
    setNewName('');
    setNewEmpId('');
    setNewRole('end_user');
    setShowAdd(true);
  };

  const handleEditClick = (user: PendingUser) => {
    setIsEditing(true);
    setNewEmail(user.email);
    setNewName(user.name || '');
    setNewEmpId(user.employeeId);
    setNewRole(user.role);
    setShowAdd(true);
  };

  const handleAddUser = async () => {
    if (!newEmail || !newEmpId || !userProfile) return;
    try {
      await setDoc(doc(db, 'pending_users', newEmail.toLowerCase()), {
        email: newEmail.toLowerCase(),
        name: newName,
        role: newRole,
        employeeId: newEmpId,
        createdBy: userProfile.userId,
        createdAt: new Date().toISOString()
      }, { merge: true }); // Use merge: true to update existing records gracefully
      setShowAdd(false);
      setNewEmail('');
      setNewName('');
      setNewEmpId('');
      setNewRole('end_user');
      setIsEditing(false);
    } catch(e) {
      handleFirestoreError(e, isEditing ? OperationType.UPDATE : OperationType.CREATE, `pending_users/${newEmail}`);
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (!confirm(`Are you sure you want to remove authorization for ${email}?`)) return;
    try {
      await deleteDoc(doc(db, 'pending_users', email));
    } catch(e) {
      handleFirestoreError(e, OperationType.DELETE, `pending_users/${email}`);
    }
  };

  if (view === 'tickets') {
    return <SupportEngineerPanel />;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">User Management</h2>
          <p className="text-slate-500 mt-1 text-xs">Pre-authorize user accounts and assign system roles.</p>
        </div>
        
        <button 
          onClick={openAddModal}
          className="flex items-center space-x-2 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-2.5 rounded-xl shadow-md transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add User Auth</span>
        </button>
      </div>

      <div className="overflow-x-auto w-full">
         <table className="w-full text-left text-sm text-slate-600 border-collapse">
           <thead className="border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
             <tr>
               <th className="px-4 py-3 pb-4">Email Address</th>
               <th className="px-4 py-3 pb-4">Name</th>
               <th className="px-4 py-3 pb-4">Employee ID</th>
               <th className="px-4 py-3 pb-4">Authorized Role</th>
               <th className="px-4 py-3 pb-4 text-right">Actions</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
              {users.map((u, index) => (
                <tr 
                  key={u.email} 
                  className="hover:bg-slate-50/70 transition-colors animate-fade-in"
                  style={{ animationDelay: `${index * 0.03}s` }}
                >
                  <td className="px-4 py-4 font-semibold text-slate-900 flex items-center">
                    <Mail className="w-4 h-4 mr-3 text-slate-400 opacity-60" />
                    {u.email}
                  </td>
                  <td className="px-4 py-4 text-xs font-medium text-slate-700">{u.name || '-'}</td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-600">{u.employeeId}</td>
                  <td className="px-4 py-4">
                     <span className={`px-2.5 py-1 uppercase text-[9px] tracking-wider font-extrabold rounded-full border ${
                       u.role !== 'end_user' 
                         ? 'bg-blue-50 text-blue-700 border-blue-200' 
                         : 'bg-slate-100 text-slate-700 border-slate-200'
                     }`}>
                        {u.role.replace('_', ' ')}
                     </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button 
                      onClick={() => handleEditClick(u)}
                      className="text-blue-500 hover:text-blue-700 transition-colors p-1.5 hover:bg-blue-50 rounded-lg cursor-pointer inline-flex mr-1"
                      title="Edit User Info"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(u.email)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded-lg cursor-pointer inline-flex"
                      title="Remove User Authorization"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-xs font-medium">
                    No authorized email profiles found. Pre-authorize a new user above.
                  </td>
                </tr>
              )}
           </tbody>
         </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-8 animate-scale-up">
               <h3 className="text-md font-bold text-slate-900 uppercase tracking-wider mb-2">{isEditing ? 'Edit User' : 'Authorize New User'}</h3>
               <p className="text-slate-500 text-xs mb-6 font-medium">Pre-configure system accounts. Users must sign up using this email address.</p>
               <div className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address <span className="text-red-400">*</span></label>
                     <input 
                       type="email" 
                       placeholder="user@company.com"
                       disabled={isEditing}
                       value={newEmail} onChange={e => setNewEmail(e.target.value)}
                       className={`w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 transition-all font-mono ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                     />
                  </div>
                  <div>
                     <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                     <input 
                       type="text" 
                       placeholder="e.g. John Doe"
                       value={newName} onChange={e => setNewName(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 transition-all"
                     />
                  </div>
                  <div>
                     <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Employee ID <span className="text-red-400">*</span></label>
                     <input 
                       type="text" 
                       placeholder="e.g. 1003"
                       value={newEmpId} onChange={e => setNewEmpId(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 transition-all font-mono"
                     />
                  </div>
                  <div>
                     <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">System Role</label>
                     <div className="relative">
                        <select 
                          value={newRole} onChange={(e: any) => setNewRole(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 appearance-none cursor-pointer [&>option]:text-black transition-all"
                        >
                          <option value="end_user">End User</option>
                          <option value="support_engineer">Support Engineer</option>
                          {userProfile?.role === 'super_admin' && <option value="alt_admin">Alt Admin</option>}
                        </select>
                     </div>
                  </div>
                   <div className="pt-4 flex items-center justify-end space-x-3">
                     <button 
                       onClick={() => setShowAdd(false)} 
                       className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                     >
                       Cancel
                     </button>
                     <button 
                       onClick={handleAddUser} 
                       disabled={!newEmail || !newEmpId}
                       className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-[#0f172a] hover:bg-[#1e293b] shadow-md rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                     >
                       {isEditing ? 'Save Changes' : 'Authorize'}
                     </button>
                  </div>
               </div>
            </div>
        </div>
      )}
    </div>
  );
}
