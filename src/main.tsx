import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { attachSelectBackspaceClose } from "./utils/selectKeyNav";

attachSelectBackspaceClose();

createRoot(document.getElementById("root")!).render(<App />);
