import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Show any error before React mounts
window.onerror = (msg, src, line, col, err) => {
  document.getElementById('root').innerHTML = 
    `<div style="padding:40px;font-family:monospace;background:#FFF1F2;color:#A32D2D;border:2px solid #FCA5A5;border-radius:8px;margin:20px">
      <b>ERRO</b><br/>${msg}<br/>Linha: ${line}<br/>${src}
    </div>`;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App/></React.StrictMode>
)
