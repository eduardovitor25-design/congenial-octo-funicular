// server.js (ESM)
import express from "express";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// rate limiter
const limiter = rateLimit({ windowMs: 10*1000, max: 18, standardHeaders:true, legacyHeaders:false });
app.use("/api/", limiter);

// simple fallback
function fallbackNarrative(action, context){
  const a = (action||"").toLowerCase();
  if(/\b(quem|nome)\b/.test(a)) return { narrative: 'Leo: "Sou Leo, caçador destas terras."', choices:[{text:"Pedir ajuda"},{text:"Ir embora"}], updates:{} };
  if(/\b(atacar|roubar|matar)\b/.test(a)){ const dmg = Math.floor(Math.random()*18)+6; return { narrative:`Conflito: você sofreu ${dmg} de dano.`, choices:[{text:"Desculpar-se"},{text:"Fugir"}], updates:{hp:-dmg} }; }
  const templates = ["Leo observa o ambiente com atenção.", "Ele aponta para trilhas recentes: 'Algo grande passou por aqui.'", "Leo prepara a lança e espera sua decisão."];
  return { narrative: templates[Math.floor(Math.random()*templates.length)], choices:[{text:"Investigar"},{text:"Seguir Leo"}], updates:{} };
}

app.post("/api/narrate", async (req, res) => {
  try{
    const { action = "", context = {} } = req.body || {};
    if(!action) return res.status(400).json({ error: "action required" });

    const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if(!OPENAI_KEY){
      return res.json(fallbackNarrative(action, context));
    }

    // system prompt instructing strict JSON output
    const systemPrompt = `
You are a concise RPG narrator in Portuguese when user uses Portuguese.
Given a Player action and a short context, OUTPUT ONLY a single valid JSON object with keys:
- narrative: string (1-3 short paragraphs)
- choices: array of objects { "text": string } (0..4)
- updates: optional object with numeric fields { hp, gold } and optional statChanges and inventoryAdd objects.
Do not output any comments, explanation, or markdown—only the JSON object.
Context summary: location: ${context.location || "unknown"}, playerName: ${context.player?.name || "player"}
`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Player action: ${action}\nContext short: ${JSON.stringify(context).slice(0,2000)}` }
    ];

    const body = { model: MODEL, messages, temperature: 0.8, max_tokens: 700, top_p: 0.9 };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(body)
    });

    if(!r.ok){
      const txt = await r.text().catch(()=>"");
      console.error("OpenAI error", r.status, txt.substring(0,800));
      return res.json(fallbackNarrative(action, context));
    }

    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || j.choices?.[0]?.text || "";

    // Try parse JSON strictly; if fails, try to extract JSON substring.
    let parsed = null;
    try { parsed = JSON.parse(content); } catch(e){
      const m = content.match(/\{[\s\S]*\}$/m);
      if(m){ try{ parsed = JSON.parse(m[0]); }catch(e2){ parsed = null; } }
    }

    if(!parsed){
      console.warn("Model output not JSON; using fallback. Content sample:", content.slice(0,600));
      return res.json(fallbackNarrative(action, context));
    }

    // sanitize updates
    if(parsed.updates){
      if(parsed.updates.hp && typeof parsed.updates.hp !== "number") delete parsed.updates.hp;
      if(parsed.updates.gold && typeof parsed.updates.gold !== "number") delete parsed.updates.gold;
    }

    return res.json(parsed);

  } catch(err){
    console.error("Narrate endpoint error:", err);
    return res.json({ narrative: "Erro interno no servidor. Usando fallback.", choices:[], updates:{} });
  }
});

// static serve
app.use(express.static(__dirname));
app.get("*", (req,res)=> res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Server running on port", PORT));
