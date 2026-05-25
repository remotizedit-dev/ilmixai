import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, runTransaction, doc } from "firebase/firestore";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // Initialize Firebase client on the server
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

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Webhook POST API for ElevenLabs
  app.post("/api/webhook/create-ticket", async (req, res) => {
    console.log("ElevenLabs Webhook received:", req.body);
    
    // ElevenLabs sends parameters inside the request body
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

      console.log("Webhook successfully created ticket:", seqId);
      res.status(200).json({ status: "success", ticketId: seqId });
    } catch (err: any) {
      console.error("Webhook failed to create ticket:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
