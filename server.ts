import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, runTransaction, doc } from "firebase/firestore";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

  // Multi-provider OCR Document Analysis Endpoint (Gemini, OpenRouter, Groq, OpenAI + Fallback)
  app.post("/api/analyze-document", async (req, res) => {
    const { fileData, mimeType } = req.body;
    if (!fileData || !mimeType) {
      return res.status(400).json({ status: "error", message: "Missing fileData or mimeType in request body." });
    }

    let geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    let openrouterKey = (process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || '').trim();
    let groqKey = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim();
    let openaiKey = (process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '').trim();

    // Auto-detect key prefix if user pasted OpenRouter/Groq/OpenAI key into GEMINI_API_KEY
    if (geminiKey.startsWith('sk-or-v1-') || geminiKey.includes('openrouter')) {
      if (!openrouterKey) openrouterKey = geminiKey;
      geminiKey = '';
    } else if (geminiKey.startsWith('gsk_')) {
      if (!groqKey) groqKey = geminiKey;
      geminiKey = '';
    } else if (geminiKey.startsWith('sk-proj-') || (geminiKey.startsWith('sk-') && !geminiKey.startsWith('sk-or-v1-'))) {
      if (!openaiKey) openaiKey = geminiKey;
      geminiKey = '';
    }

    const promptText = `You are an expert OCR AI specializing in reading printed and handwritten Information Technology Support Tickets.
Carefully examine the document image/PDF and extract:
1. "employeeId": The Employee ID (e.g. RF21157, 1003, etc.) listed under Employee Particulars.
2. "title": A concise title based on the Support Description or Problem Note (e.g. "Laptop and Pocket Router Out of Order").
3. "description": Combine all problem details, including Employee Name, Designation, Department, Support Description, IT Findings, and IT Recommendations into a clear summary.
4. "createdAt": The document date or signature date formatted as an ISO string (e.g. 2026-07-21T00:00:00.000Z). If no date is found, leave as empty string.

Return ONLY a valid JSON object with no markdown syntax, matching this exact structure:
{
  "employeeId": "string",
  "title": "string",
  "description": "string",
  "createdAt": "string"
}`;

    let extractedData: any = null;

    // Provider 1: Gemini REST API / Google AI Studio
    if (geminiKey && !geminiKey.includes('your_')) {
      const candidateModels = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      for (const modelName of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: mimeType, data: fileData } },
                  { text: promptText }
                ]
              }]
            })
          });

          const json = await response.json();
          if (response.ok && json.candidates?.[0]?.content?.parts?.[0]?.text) {
            const rawText = json.candidates[0].content.parts[0].text;
            const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            extractedData = JSON.parse(cleaned);
            console.log(`Successfully extracted ticket via Gemini model: ${modelName}`);
            break;
          } else {
            console.warn(`Gemini REST API (${modelName}) warning:`, json.error?.message || json);
          }
        } catch (gErr) {
          console.warn(`Gemini model ${modelName} fetch error:`, gErr);
        }
      }
    }

    // Provider 2: OpenRouter API (if set)
    if (!extractedData && openrouterKey) {
      const openRouterVisionModels = [
        'openrouter/auto',
        'google/gemini-2.5-flash',
        'google/gemini-2.5-pro'
      ];

      for (const orModel of openRouterVisionModels) {
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openrouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'http://localhost:3000',
              'X-Title': 'IT Support Ticket OCR'
            },
            body: JSON.stringify({
              model: orModel,
              max_tokens: 1500,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileData}` } },
                    { type: 'text', text: promptText }
                  ]
                }
              ]
            })
          });
          const json = await response.json();
          if (response.ok && json.choices?.[0]?.message?.content) {
            const cleaned = json.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            extractedData = JSON.parse(cleaned);
            console.log(`Successfully extracted ticket via OpenRouter model: ${orModel}`);
            break;
          } else {
            console.warn(`OpenRouter model (${orModel}) warning:`, json.error?.message || json);
          }
        } catch (orErr) {
          console.warn(`OpenRouter model ${orModel} error:`, orErr);
        }
      }
    }

    // Provider 3: Groq API (if set)
    if (!extractedData && groqKey) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.2-11b-vision-preview',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileData}` } },
                  { type: 'text', text: promptText }
                ]
              }
            ]
          })
        });
        const json = await response.json();
        if (response.ok && json.choices?.[0]?.message?.content) {
          const cleaned = json.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
          extractedData = JSON.parse(cleaned);
          console.log("Successfully extracted ticket via Groq API.");
        }
      } catch (groqErr) {
        console.warn("Groq API error:", groqErr);
      }
    }

    // Provider 4: OpenAI API (if set)
    if (!extractedData && openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileData}` } },
                  { type: 'text', text: promptText }
                ]
              }
            ]
          })
        });
        const json = await response.json();
        if (response.ok && json.choices?.[0]?.message?.content) {
          const cleaned = json.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
          extractedData = JSON.parse(cleaned);
          console.log("Successfully extracted ticket via OpenAI API.");
        }
      } catch (oaiErr) {
        console.warn("OpenAI API error:", oaiErr);
      }
    }

    // Resilient Fallback (Guarantees ticket intake modal always opens even without active AI API quota)
    if (!extractedData) {
      extractedData = {
        employeeId: '',
        title: 'Uploaded Document Ticket',
        description: 'Scanned ticket document uploaded. Please review and complete fields below.',
        createdAt: new Date().toISOString()
      };
    }

    return res.status(200).json({
      status: "success",
      data: {
        employeeId: extractedData.employeeId || '',
        title: extractedData.title || 'Support Ticket',
        description: extractedData.description || '',
        createdAt: extractedData.createdAt || ''
      }
    });
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
