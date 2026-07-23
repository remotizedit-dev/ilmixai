export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
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

  const { fileData, mimeType } = req.body;
  if (!fileData || !mimeType) {
    return res.status(400).json({ status: "error", message: "Missing fileData or mimeType in request body." });
  }

  let geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  let openrouterKey = (process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || '').trim();
  let groqKey = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim();
  let openaiKey = (process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '').trim();

  // Smart Key Auto-Routing by prefix
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

  // Provider 1: Gemini REST API
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
          break;
        }
      } catch (gErr) {
        console.warn(`Gemini model ${modelName} fetch error:`, gErr);
      }
    }
  }

  // Provider 2: OpenRouter API
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
          break;
        }
      } catch (orErr) {
        console.warn(`OpenRouter model ${orModel} error:`, orErr);
      }
    }
  }

  // Provider 3: Groq API
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
      }
    } catch (groqErr) {
      console.warn("Groq API error:", groqErr);
    }
  }

  // Provider 4: OpenAI API
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
      }
    } catch (oaiErr) {
      console.warn("OpenAI API error:", oaiErr);
    }
  }

  // Resilient Fallback
  if (!extractedData) {
    extractedData = {
      employeeId: '',
      title: 'Uploaded Support Ticket',
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
}
