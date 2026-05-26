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
    <div className="min-h-screen flex items-center justify-center bg-transparent">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-[0_15px_45px_rgba(0,0,0,0.06)] p-10 space-y-8 animate-scale-up">
        <div className="w-16 h-16 bg-slate-50 text-slate-900 rounded-2xl flex items-center justify-center mx-auto border border-slate-200 shadow-sm">
           <LogIn className="w-8 h-8" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">ilmix <span className="text-blue-600">AI</span></h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-2 font-bold">by Remotized IT</p>
        </div>
        
        {error && (
          <div className="p-3.5 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200 text-center font-medium animate-pulse">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 transition-all"
              placeholder="name@company.com"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none text-slate-900 placeholder-slate-400 transition-all"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 bg-[#0f172a] hover:bg-[#1e293b] text-white py-3.5 px-4 rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.15)] transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-4 cursor-pointer animate-fade-in"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              <span>{isRegister ? 'Create Account' : 'Sign In'}</span>
            )}
          </button>
        </form>
        
        <div className="text-center pt-2">
          <button 
            type="button" 
            onClick={() => setIsRegister(!isRegister)}
            className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            {isRegister ? 'Already registered? Sign In' : 'New here? Register Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
