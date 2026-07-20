export function readEnv(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name]
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "")
}
