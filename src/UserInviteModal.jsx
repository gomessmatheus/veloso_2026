import { useState } from "react";
import { B2, B3, LN, TX, TX2, TX3, RED } from "../constants/tokens.js";
import { useToast } from "../context/ToastContext.jsx";
import { Modal, Btn, Field, Input } from "./ui.jsx";

export function UserInviteModal({ onClose }) {
  const [email, setEmail]   = useState("");
  const [pass, setPass]     = useState(() =>
    Math.random().toString(36).slice(2, 10).toUpperCase() + "!" + Math.floor(Math.random() * 90 + 10)
  );
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleCreate = async () => {
    if (!email) return setError("Informe o email.");
    setLoading(true); setError("");
    try {
      const { createUserWithEmailAndPassword } = await import("firebase/auth");
      const { auth } = await import("../firebase.js");
      await createUserWithEmailAndPassword(auth, email, pass);
      setDone(true);
      toast?.("✓ Usuário criado com sucesso", "success");
    } catch (e) {
      setError(e.message?.includes("email-already") ? `${email} já tem conta.` : String(e.message));
    }
    setLoading(false);
  };

  return (
    <Modal title="Convidar Usuário" onClose={onClose} width={480}
      footer={<>
        <Btn onClick={onClose} variant="ghost" size="sm">Fechar</Btn>
        {!done && <Btn onClick={handleCreate} variant="primary" size="sm" disabled={loading}>{loading ? "Criando…" : "Criar conta"}</Btn>}
      </>}>
      {done ? (
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:14, fontWeight:700, color:TX, marginBottom:8 }}>Conta criada!</div>
          <div style={{ fontSize:12, color:TX2, marginBottom:16 }}>Compartilhe as credenciais abaixo:</div>
          <div style={{ background:B2, border:`1px solid ${LN}`, borderRadius:8, padding:16, textAlign:"left" }}>
            <div style={{ fontSize:12, marginBottom:6 }}><b>Email:</b> {email}</div>
            <div style={{ fontSize:12 }}><b>Senha temporária:</b> <code style={{ background:B3, padding:"2px 6px", borderRadius:4 }}>{pass}</code></div>
          </div>
          <div style={{ fontSize:11, color:TX3, marginTop:10 }}>O usuário pode alterar a senha após o primeiro login.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Field label="Email do novo usuário">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="lucas@veloso.com" />
          </Field>
          <Field label="Senha temporária">
            <div style={{ display:"flex", gap:8 }}>
              <Input value={pass} onChange={e => setPass(e.target.value)} style={{ flex:1 }} />
              <Btn onClick={() => setPass(Math.random().toString(36).slice(2, 10).toUpperCase() + "!" + Math.floor(Math.random() * 90 + 10))} variant="ghost" size="sm">🔄</Btn>
            </div>
          </Field>
          {error && (
            <div style={{ fontSize:11, color:RED, background:"rgba(200,16,46,.08)", border:"1px solid rgba(200,16,46,.2)", borderRadius:6, padding:"8px 12px" }}>
              {error}
            </div>
          )}
          <div style={{ fontSize:11, color:TX3, padding:"10px 12px", background:B2, borderRadius:6 }}>
            O usuário receberá acesso completo ao app. Após o primeiro login, pode alterar a própria senha em <b>veloso-2026.vercel.app</b>.
          </div>
        </div>
      )}
    </Modal>
  );
}
