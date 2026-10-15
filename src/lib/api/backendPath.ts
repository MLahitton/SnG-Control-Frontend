export const backendRoots = ["clients", "projects", "project-tasks", "notifications"] as const;

export function isBackendPath(segments: string[]): boolean {
  return segments.length > 0 && segments.length <= 20
    && backendRoots.some((root) => root === segments[0])
    && segments.every((segment) => segment.length <= 200
      && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(segment));
}
