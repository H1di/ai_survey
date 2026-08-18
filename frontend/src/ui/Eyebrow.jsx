import "./ui.css";

// The mono step marker: "step 2 · big five · item 1 of 20".
export default function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>;
}
