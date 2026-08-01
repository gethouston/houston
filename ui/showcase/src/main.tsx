import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./globals.css";
import { Showcase } from "./showcase";

const root = document.getElementById("root");
if (!root) throw new Error("showcase: #root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <Showcase />
  </StrictMode>,
);
