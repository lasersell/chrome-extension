import React from "react";
import ReactDOM from "react-dom/client";

import "../globals.css";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PopupApp } from "./PopupApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PopupApp />
    </ErrorBoundary>
  </React.StrictMode>
);
