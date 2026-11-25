import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// The web app manifest exists so iPhones can add the app to the home screen. It must not
// change anything for Android or desktop users, so the install banner Chrome may offer
// for a site with a manifest is declined here. (iOS never fires this event.)
window.addEventListener("beforeinstallprompt", (event) => event.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
