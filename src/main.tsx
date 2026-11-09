import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./app/router.tsx";
import { sourceFromHash } from "./features/share/share.ts";
import "./index.css";
import { initSession, useSession } from "./session/store.ts";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

initSession(router.state.location.search.example ?? "factorial", sourceFromHash(window.location.hash));
useSession.subscribe((s, prev) => {
  if (s.programId === prev.programId) return;
  void router.navigate({ to: "/", search: old => ({ view: old.view ?? "panels", example: s.programId }), replace: true, hash: "" });
});

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
