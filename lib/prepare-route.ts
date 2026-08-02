import type { AppView } from "@/components/app-shell";

/**
 * Canonical Prepare destination for the Identity SPA.
 *
 * All Prepare entry points (Home, People, Journey, client navigation,
 * Looking Ahead) must resolve through this helper so the same view and
 * component are always used. URL path shape is documented for consistency
 * with product language; navigation remains SPA AppView-based.
 */
export type PrepareRoute = {
  /** Documented canonical path shape — not a Next.js file route. */
  path: `/people/${string}/prepare`;
  view: Extract<AppView, "prepare">;
  personId: string;
};

export const PREPARE_VIEW: PrepareRoute["view"] = "prepare";

export function getPrepareRoute(personId: string): PrepareRoute {
  return {
    path: `/people/${personId}/prepare`,
    view: PREPARE_VIEW,
    personId,
  };
}

export function isPrepareView(view: AppView): boolean {
  return view === PREPARE_VIEW;
}
