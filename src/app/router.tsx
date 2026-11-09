import { createRootRoute, createRouter } from "@tanstack/react-router";
import { isExampleId } from "../examples/index.ts";
import { CUSTOM_PROGRAM, VIEWS, type ProgramId, type View } from "../session/types.ts";
import { App } from "./app.tsx";

export interface AppSearch {
  view: View;
  example?: ProgramId;
}

const isView = (v: unknown): v is View => typeof v === "string" && (VIEWS as readonly string[]).includes(v);
const isProgramId = (v: unknown): v is ProgramId => typeof v === "string" && (v === CUSTOM_PROGRAM || isExampleId(v));

export const rootRoute = createRootRoute({
  validateSearch: (search: Record<string, unknown>): AppSearch => ({
    view: isView(search.view) ? search.view : "panels",
    ...(isProgramId(search.example) ? { example: search.example } : {})
  }),
  component: App
});

export const router = createRouter({ routeTree: rootRoute });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
