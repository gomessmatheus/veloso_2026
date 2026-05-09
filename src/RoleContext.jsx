import { createContext, useContext } from "react";
import { ROLE_CAN } from "../constants/roles.js";

export const RoleCtx = createContext({ role:"admin", userName:"", can:{} });

export function useRole() {
  return useContext(RoleCtx);
}

export function RoleProvider({ role, userName, children }) {
  const can = ROLE_CAN[role] || ROLE_CAN.admin;
  return (
    <RoleCtx.Provider value={{ role, userName, can }}>
      {children}
    </RoleCtx.Provider>
  );
}
