import express from "express"
import fetch from "node-fetch"
import cors from "cors"

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static("."))

const PORT = process.env.PORT || 3000

const OPENAI_KEY = process.env.OPENAI_KEY

app.post("/ai", async (req,res)=>{

try{

const {message,history} = req.body

const prompt = `
Você é um narrador de RPG Isekai.

Regras:

- Continue a história
- Responda ao que o jogador disse
- Crie eventos interessantes
- Personagens podem reagir
- Mantenha estilo narrativo

Histórico:
${history}

Jogador disse:
${message}

Continue a história:
`

const response = await fetch("https://api.openai.com/v1/chat/completions",{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":`Bearer ${OPENAI_KEY}`
},
body:JSON.stringify({
model:"gpt-4o-mini",
messages:[
{role:"system",content:"Você é um narrador de RPG procedural."},
{role:"user",content:prompt}
],
temperature:0.9
})
})

const data = await response.json()

res.json({
reply:data.choices[0].message.content
})

}catch(e){

console.log(e)

res.json({
reply:"O vento sopra entre as árvores... algo parece errado."
})

}

})

app.listen(PORT,()=>{

console.log("Servidor rodando na porta "+PORT)

})
