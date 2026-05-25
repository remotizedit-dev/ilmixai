import { initializeApp } from "firebase/app";
import { getFirestore, runTransaction, doc } from "firebase/firestore";

// Initialize Firebase client using the same environment variables loaded by Vercel
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const appFirebase = initializeApp(firebaseConfig);
const databaseId = process.env.VITE_FIREBASE_DATABASE_ID;
const db = databaseId ? getFirestore(appFirebase, databaseId) : getFirestore(appFirebase);

const getNextTicketId = async (): Promise<string> => {
  const counterRef = doc(db, 'system', 'counters');
  
  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let nextId = 150; // Start at 150 (corresponds to "0150")
    
    if (counterDoc.exists()) {
      const data = counterDoc.data();
      if (data && typeof data.ticketCounter === 'number') {
        nextId = data.ticketCounter + 1;
      }
    }
    
    transaction.set(counterRef, { ticketCounter: nextId }, { merge: true });
    return String(nextId).padStart(4, '0');
  });
};

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: "error", message: "Method Not Allowed" });
  }

  const { employeeId, title, summary, fullName, fullname, userName, username } = req.body;
  const finalName = fullName || fullname || userName || username || "AI Voice User";

  try {
    const seqId = await getNextTicketId();
    const ticketRef = doc(db, 'tickets', seqId);
    
    await runTransaction(db, async (transaction) => {
      transaction.set(ticketRef, {
        ticketId: seqId,
        title: title || "AI Voice Ticket",
        description: summary || "Created via ElevenLabs Conversational AI Webhook.",
        employeeId: employeeId || "Unknown",
        creatorUserId: "Guest-AI",
        creatorName: finalName,
        status: 'open',
        assignedTo: '',
        createdAt: new Date().toISOString(),
        totalSupportTimeSeconds: 0,
        timerState: 'paused'
      });
    });

    console.log("Vercel Serverless Webhook created ticket successfully:", seqId);
    return res.status(200).json({ status: "success", ticketId: seqId });
  } catch (err: any) {
    console.error("Vercel Serverless Webhook failed to create ticket:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
