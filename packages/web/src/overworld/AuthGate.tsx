import { useEffect, useState } from "react";
import { currentSpace, logoutSpace } from "../api/client.js";
import { LoginScreen } from "../components/LoginScreen.js";
import { OverworldRoot } from "./OverworldRoot.js";

type Space = { id: string; name: string };

/**
 * The app's real entry point once the galaxy is retired. Mirrors App.tsx's own former
 * boot gate exactly (resolve `currentSpace()` → loading → LoginScreen → the app) since
 * OverworldRoot itself has no opinion about auth — without this, deleting App.tsx would
 * have left no way for anyone to sign in.
 */
export function AuthGate() {
  const [authChecked, setAuthChecked] = useState(false);
  const [space, setSpace] = useState<Space | null>(null);

  useEffect(() => {
    currentSpace()
      .then(setSpace)
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#f4f1ff",
          background: "#0c0e1a",
          fontFamily: "monospace",
        }}
      >
        Aligning the stars...
      </div>
    );
  }

  if (!space) {
    return <LoginScreen onAuthed={setSpace} />;
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#0c0e1a" }}>
      <div style={{ position: "fixed", top: 8, right: 8, zIndex: 10 }}>
        <button
          type="button"
          onClick={() => {
            logoutSpace();
            setSpace(null);
          }}
          style={{ fontSize: 12, fontFamily: "monospace" }}
        >
          Log out ({space.name})
        </button>
      </div>
      <OverworldRoot />
    </div>
  );
}
