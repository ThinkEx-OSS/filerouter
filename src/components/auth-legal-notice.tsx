import { Link } from "@tanstack/react-router"

export function AuthLegalNotice() {
  return (
    <p className="text-center text-xs leading-5 text-muted-foreground">
      By continuing, you agree to the{" "}
      <Link
        className="underline underline-offset-4 hover:text-foreground"
        to="/terms"
      >
        Terms
      </Link>{" "}
      and acknowledge the{" "}
      <Link
        className="underline underline-offset-4 hover:text-foreground"
        to="/privacy"
      >
        Privacy Policy
      </Link>{" "}
      and{" "}
      <Link
        className="underline underline-offset-4 hover:text-foreground"
        to="/cookies"
      >
        Cookie Policy
      </Link>
      .
    </p>
  )
}
