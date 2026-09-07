import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main>
      <p className="eyebrow">Brainless Chef</p>
      <h1>Good food, fewer decisions.</h1>
      <p className="intro">The kitchen is warming up. Check back soon for simple meals and smarter plans.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
