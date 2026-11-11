import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";

// Entry used by every frontend/demos/<slug>.html page.
export function mountDemo(Demo) {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      {createElement(Demo)}
    </StrictMode>
  );
}
