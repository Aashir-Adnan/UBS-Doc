// The old /tools/tasks route moved under /tools/team/tasks; this is the pure
// mapping a tiny <Navigate> wrapper in routes.tsx uses, kept testable apart
// from useLocation()/react-router.
export function legacyTasksRedirect(search: string): string {
  return `/tools/team/tasks${search}`
}
