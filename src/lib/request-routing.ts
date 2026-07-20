export function isHonoApiPath(pathname: string): boolean {
  return (
    pathname === "/api/v1" ||
    pathname.startsWith("/api/v1/") ||
    pathname === "/api/openapi.json"
  )
}
