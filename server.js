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
app.use(express.json({ limit: "128kb" }));

// rate limiter for API endpoints
const limiter = rateLimit({
  windowMs: 10 * 1000, // 10s
  max: 12, // max 12 requests per 10s
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", limiter);

// fallback narrative (safe)
function fallbackNarrative(action, context){
  const a = (action||"").toLowerCase();
  if(a.includes("quem") || a.includes("quem é")) {
    return { narrative: 'Leo: "Sou Leo, caçador desta floresta. Por que pergunta?"', choices:[{text:"Pedir ajuda"},{text:"Atacar"}], updates:{} };
  }
  if(/roubar|atacar|assaltar/.test(a)){
    const dmg = Math.floor(Math.random()*18)+4;
    return { narrative:`Conflito: você se machuca e perde ${dmg} HP.`, choices:[{text:"Desculpar-se"},{text:"Fugir"}], updates:{hp:-dmg} };
  }
  const templates = [
    "Leo aponta para trilhas recentes e sugere cautela. Ele fala de uma ruína ao norte.",
    "Uma brisa fria passa; Leo comenta que ouviu uivos ao longe e oferece companhia.",
    "Você vê marcas de garras. Leo pega a lança: 'Não é seguro sozinho.'"
  ];
  return { narrative: templates[Math.floor(Math.random()*templates.length)], choices:[{text:"Investigar"},{text:"Seguir Leo"}], updates:{} };
}

// POST /api/narrate
app.post("/api/narrate", async (req, res) => {
  try{
    const { action = "", context = {} } = req.body || {};
    if(!action) return res.status(400).json({ error: "action required" });

    const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if(!OPENAI_KEY){
      // no remote key -> fallback
      return res.json(fallbackNarrative(action, context));
    }

    // careful system prompt instructing JSON output
    const systemPrompt = `
You are a concise RPG narrator in Portuguese (unless player writes in English).
Given the player's action and a short context, output ONLY a valid JSON object (no other text) with these keys:
- narrative: string (1-3 short paragraphs)
- choices: array of objects { "text": string } (0..4)
- updates: optional object with numeric fields { hp, gold } and optional statChanges and inventoryAdd objects.
Keep narrative short, avoid unsafe instructions. Use player/context provided.
Context summary: location: ${context.location || "unknown"}, player: ${context.player?.name || "player"}
`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Player action: ${action}\nContext (short): ${JSON.stringify(context).slice(0,2000)}` }
    ];

    const payload = {
      model: OPENAI_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 700,
      top_p: 0.9
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(payload)
    });

    if(!r.ok){
      console.error("OpenAI API error status:", r.status);
      const txt = await r.text().catch(()=>"");
      console.error("OpenAI body:", txt);
      return res.json(fallbackNarrative(action, context));
    }

    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || j.choices?.[0]?.text || "";

    // Try parse JSON; try to extract JSON substring in case model adds formatting
    let parsed = null;
    try{ parsed = JSON.parse(content); }catch(e){
      const m = content.match(/\{[\s\S]*\}/m);
      if(m){ try{ parsed = JSON.parse(m[0]); }catch(e2){ parsed = null; } }
    }

    if(!parsed){
      console.warn("Model output not JSON; using fallback; content:", content.substring(0,800));
      return res.json(fallbackNarrative(action, context));
    }

    // final sanitation: ensure updates fields are numeric if present
    if(parsed.updates){
      if(parsed.updates.hp && typeof parsed.updates.hp !== "number") delete parsed.updates.hp;
      if(parsed.updates.gold && typeof parsed.updates.gold !== "number") delete parsed.updates.gold;
    }

    return res.json(parsed);

  } catch(err){
    console.error("Narrate endpoint error:", err);
    return res.json({ narrative: "Ocorreu um erro no servidor. Usando fallback local.", choices:[], updates:{} });
  }
});

// serve static files
app.use(express.static(__dirname));
app.get("*", (req,res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Server running on port", PORT));
