import { useState } from 'react';
import { loginWithEmail, registerWithEmail, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../App';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let user;
      if (isRegister) {
        user = await registerWithEmail(email, password);
      } else {
        user = await loginWithEmail(email, password);
      }
      
      // Check if user exists
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        // If not exists, check pending users OR check if first user ever
        const sysSetupDoc = await getDoc(doc(db, 'system', 'setup'));
        
        let role = 'end_user';
        let employeeId = `EMP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        
        if (!sysSetupDoc.exists()) {
          role = 'super_admin';
          // Initialize system setup in the same "batch" logically (though frontend sequential here, rules allow)
        } else {
           if (user.email) {
             const pendingDoc = await getDoc(doc(db, 'pending_users', user.email));
             if (pendingDoc.exists()) {
               role = pendingDoc.data().role;
               employeeId = pendingDoc.data().employeeId;
             }
           }
        }

        const newUser = {
          userId: user.uid,
          email: user.email || '',
          name: user.email?.split('@')[0] || 'New User',
          phoneNumber: '',
          employeeId,
          role,
          createdAt: new Date().toISOString()
        };

        try {
          await setDoc(doc(db, 'users', user.uid), newUser);
          
          if (role === 'super_admin' && !sysSetupDoc.exists()) {
            await setDoc(doc(db, 'system', 'setup'), { initialized: true });
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`);
        }
      }
      
      await refreshProfile(user.uid);
      navigate('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to authenticate.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 p-8 space-y-6">
        <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
           <LogIn className="w-8 h-8" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">ilmix <span className="text-blue-400">AI</span></h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-2">Developed by Remotized IT</p>
        </div>
        
        {error && (
          <div className="p-3 bg-red-500/20 text-red-300 text-sm rounded-xl border border-red-500/30 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 uppercase mb-1.5">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-400 text-white py-3 px-4 rounded-xl shadow-xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span>{isRegister ? 'Register' : 'Login'}</span>
            )}
          </button>
        </form>
        
        <div className="text-center">
          <button 
            type="button" 
            onClick={() => setIsRegister(!isRegister)}
            className="text-[11px] uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
          >
            {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
