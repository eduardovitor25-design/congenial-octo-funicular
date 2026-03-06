// ai_tester.js
import fetch from "node-fetch";

const API = process.env.API_URL || "http://localhost:3000/api/narrate"; // ou https://isekai-life.onrender.com/api/narrate
const tests = [
  "Garuk: Olá, quem é você?",
  "Garuk: Vou embora, adeus.",
  "Garuk: Vou atacar.",
  "Garuk: Quero renascer em outro mundo.",
  "Garuk: Me diga sobre as ruínas ao norte.",
  "Garuk: Quero trabalhar como mercador."
];

async function run(){
  const results = [];
  for(const t of tests){
    const payload = { sessionId: "test-sess", action: t, context:{ recent: [] } };
    try{
      const res = await fetch(API, { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload), timeout: 10000 });
      const data = await res.json();
      results.push({ prompt: t, reply: (data.narrative||data.reply||data).slice(0,500) });
      console.log("PROMPT:", t);
      console.log("REPLY:", (data.narrative||data.reply||data).slice(0,1000));
      console.log("-----");
    }catch(err){
      console.error("ERR for prompt:", t, err);
    }
  }
  // basic metrics
  const uniq = new Set(results.map(r=>r.reply));
  console.log("Total tests:", results.length, "Unique replies:", uniq.size);
}
run();
