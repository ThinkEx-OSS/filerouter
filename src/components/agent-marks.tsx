const agents = [
  {
    className: "size-4",
    invertInDark: false,
    label: "Claude Code",
    src: "/agents/claude.svg",
  },
  {
    className: "size-4",
    invertInDark: true,
    label: "Codex",
    src: "/agents/codex.svg",
  },
  {
    className: "size-4",
    invertInDark: true,
    label: "Cursor",
    src: "/agents/cursor.svg",
  },
  {
    className: "size-3.5",
    invertInDark: true,
    label: "OpenCode",
    src: "/agents/opencode.svg",
  },
  {
    className: "size-5",
    invertInDark: true,
    label: "Pi",
    src: "/agents/pi.svg",
  },
] as const

export function AgentMarks() {
  return (
    <div aria-hidden="true" className="flex shrink-0 items-center gap-3">
      {agents.map((agent) => (
        <img
          alt=""
          className={`${agent.className} object-contain opacity-55 ${agent.invertInDark ? "dark:invert" : ""}`}
          key={agent.label}
          src={agent.src}
          title={agent.label}
        />
      ))}
    </div>
  )
}
