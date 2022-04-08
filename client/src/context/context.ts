import React, { useContext } from "react";

export const PathContext = React.createContext<any>([]);
export const usePath = () => useContext(PathContext);
