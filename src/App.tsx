import { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router';
import { onAuthStateChanged, User as FirebaseAuthUser } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Role, User } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

interface AuthContextType {
  currentUser: FirebaseAuthUser | null;
  userProfile: User | null;
  loading: boolean;
  refreshProfile: (uid?: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  refreshProfile: async (_uid?: string) => {},
});

export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseAuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async (uid?: string) => {
    const targetUid = uid || currentUser?.uid;
    if (!targetUid) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', targetUid));
      if (userDoc.exists()) {
        let userData = userDoc.data() as User;
        
        // Background Sync with pending_users
        if (userData.email) {
          try {
             const pendingDoc = await getDoc(doc(db, 'pending_users', userData.email.toLowerCase()));
             if (pendingDoc.exists()) {
               const pData = pendingDoc.data();
               let needsUpdate = false;
               const updates: any = {};
               
               if (pData.name && userData.name !== pData.name) {
                 updates.name = pData.name;
                 userData.name = pData.name;
                 needsUpdate = true;
               }
               if (pData.role && userData.role !== pData.role) {
                 updates.role = pData.role;
                 userData.role = pData.role as Role;
                 needsUpdate = true;
               }
               if (pData.employeeId && userData.employeeId !== pData.employeeId) {
                 updates.employeeId = pData.employeeId;
                 userData.employeeId = pData.employeeId;
                 needsUpdate = true;
               }
               
               if (needsUpdate) {
                 await setDoc(doc(db, 'users', targetUid), updates, { merge: true });
               }
             }
          } catch (syncErr) {
             console.error("Silent sync failed", syncErr);
          }
        }
        
        setUserProfile(userData);
      } else {
        setUserProfile(null);
      }
    } catch (err) {
      console.error("Failed to load user profile", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await refreshProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, loading, refreshProfile }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/dashboard" replace />} />
          <Route 
            path="/dashboard/*" 
            element={
              currentUser ? <Dashboard /> : <Navigate to="/login" replace />
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

