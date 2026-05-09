import { RED, BLU } from "./tokens.js";

export const USER_ROLES = {
  "lucas.veloso4001@gmail.com": "influencer",
  "caio@rnkd.com.br":           "agente",
  "matheus@rnkd.com.br":        "atendimento",
  "beatriz@rnkd.com.br":        "atendimento",
  "thiago@rnkd.com.br":         "agente",
  "matheussgbf@gmail.com":      "admin",
};

export const ROLE_NAMES = {
  "lucas.veloso4001@gmail.com": "Lucas",
  "caio@rnkd.com.br":           "Caio",
  "matheus@rnkd.com.br":        "Matheus",
  "beatriz@rnkd.com.br":        "Beatriz",
  "thiago@rnkd.com.br":         "Thiago",
  "matheussgbf@gmail.com":      "Matheus",
};

export const ROLE_META = {
  admin:       { label:"Admin",          color:RED,       badge:"👑" },
  agente:      { label:"Agente Ranked",  color:"#7C3AED", badge:"📊" },
  atendimento: { label:"Atendimento",    color:BLU,       badge:"🤝" },
  influencer:  { label:"Influenciador",  color:"#059669", badge:"🎬" },
};

export const ROLE_NAV = {
  admin:       ["dashboard","acompanhamento","contratos","financeiro","caixa"],
  agente:      ["dashboard","contratos","financeiro"],
  atendimento: ["dashboard","acompanhamento","contratos"],
  influencer:  ["dashboard","acompanhamento","financeiro"],
};

export const ROLE_CAN = {
  admin:       { editContracts:true,  seeValues:true,  seeCaixa:true,   editDeliverables:true,  seeRoteiros:true,  seeFullFinanceiro:true  },
  agente:      { editContracts:true,  seeValues:true,  seeCaixa:false,  editDeliverables:false, seeRoteiros:false, seeFullFinanceiro:true  },
  atendimento: { editContracts:false, seeValues:false, seeCaixa:false,  editDeliverables:true,  seeRoteiros:true,  seeFullFinanceiro:false },
  influencer:  { editContracts:false, seeValues:false, seeCaixa:false,  editDeliverables:true,  seeRoteiros:true,  seeFullFinanceiro:false },
};
