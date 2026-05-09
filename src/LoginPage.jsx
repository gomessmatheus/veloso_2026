import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase.js";
import { TX, TX2, TX3, RED, LN } from "../constants/tokens.js";
import { Field } from "./ui.jsx";
import { Input } from "./ui.jsx";

export function LoginPage() {
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleLogin = async e => {
    e.preventDefault();
    if (!email || !pass) return setError("Preencha email e senha.");
    setLoading(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch {
      setError("Email ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  };

  const mob = window.innerWidth < 768;

  return (
    <div style={{ minHeight:"100vh", background:"#F7F6EF", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Plus Jakarta Sans,system-ui,sans-serif", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:-200, left:-200, width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle, rgba(200,16,46,.08) 0%, transparent 70%)", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", bottom:-150, right:-100, width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle, rgba(29,78,216,.06) 0%, transparent 70%)", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", inset:0, backgroundImage:`linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)`, backgroundSize:"60px 60px", opacity:.5, pointerEvents:"none" }}/>

      <div style={{ marginBottom:40, textAlign:"center", position:"relative" }}>
        <div style={{ fontSize:13, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:TX }}>
          ENTRE<span style={{ color:RED }}>GAS</span>
        </div>
        <div style={{ fontSize:12, color:TX2, marginTop:6, letterSpacing:".04em" }}>Gestão de contratos e entregas · Ranked</div>
      </div>

      <div style={{ background:"#FEFEFE", border:"1px solid #F0F0F2", borderRadius:16, width:"100%", maxWidth:380, padding:mob ? 20 : 36, margin:mob ? "0 12px" : "0", position:"relative", boxShadow:"0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:TX, marginBottom:6, letterSpacing:"-.01em" }}>Entrar na plataforma</h2>
        <p style={{ fontSize:12, color:TX2, marginBottom:24 }}>Acesso restrito à equipe Ranked</p>

        <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Field label="Email">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="matheus@standproducoes.com" />
          </Field>
          <Field label="Senha">
            <Input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && (
            <div style={{ fontSize:11, color:RED, background:"rgba(200,16,46,.1)", border:"1px solid rgba(200,16,46,.2)", borderRadius:6, padding:"8px 12px" }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ width:"100%", padding:"11px", background:RED, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", cursor:loading ? "wait" : "pointer", marginTop:4, opacity:loading ? .7 : 1 }}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div style={{ marginTop:20, paddingTop:20, borderTop:`1px solid ${LN}`, fontSize:10, color:TX3, textAlign:"center" }}>
          Lucas Veloso @veloso.lucas_
        </div>
      </div>
    </div>
  );
}
