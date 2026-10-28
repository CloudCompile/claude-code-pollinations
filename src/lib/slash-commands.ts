// Slash commands supported by Claude Code. In `-p` (print) mode, commands
// are passed through as prompt text; the CLI resolves them when it recognizes
// them. We surface them in the UI as quick actions.

export type SlashCommand = {
  name: string;
  description: string;
  /** Whether it needs an argument (prompt text). */
  needsArg?: boolean;
  /** Map to a literal prompt that reproduces the command in -p mode. */
  prompt?: (arg: string) => string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/compact", description: "Compact the conversation history" },
  { name: "/context", description: "Show the current context / working directory" },
  { name: "/cost", description: "Show token/relevant cost usage for the session" },
  { name: "/config", description: "Open / show Claude Code configuration", needsArg: true },
  {
    name: "/add-dir",
    description: "Add a directory to the conversation",
    needsArg: true,
    prompt: (a) => `Add the directory ${a} to the conversation context.`,
  },
  {
    name: "/clear",
    description: "Clear the current session history",
    prompt: () => "Start a fresh session (clear conversation history).",
  },
  { name: "/doctor", description: "Check Claude Code installation and configuration" },
  { name: "/help", description: "List available slash commands" },
  { name: "/hooks", description: "Manage hooks", needsArg: true },
  { name: "/logout", description: "Log out of Claude Code auth" },
  { name: "/memory", description: "Show / manage memory", needsArg: true },
  {
    name: "/model",
    description: "Switch model (overrides sandbox env model)",
    needsArg: true,
    prompt: (a) => `Use the model ${a} for this session.`,
  },
  { name: "/mcp", description: "Manage MCP servers", needsArg: true },
  { name: "/permissions", description: "Show permission settings" },
  {
    name: "/pr",
    description: "Open / create a pull request",
    needsArg: true,
    prompt: (a) => `Create a pull request for: ${a}`,
  },
  {
    name: "/resume",
    description: "Resume a prior session",
    needsArg: true,
    prompt: (a) => `Resume the session ${a}.`,
  },
  { name: "/todos", description: "Show / manage todos" },
  { name: "/usage", description: "Show the current token/context usage" },
  { name: "/vim", description: "Toggle vim keybindings" },
];

export function lookupSlash(input: string): SlashCommand | null {
  const trimmed = input.trim();
  const [word] = trimmed.split(/\s+/);
  if (!word?.startsWith("/")) return null;
  const cmd = SLASH_COMMANDS.find((c) => c.name === word);
  if (!cmd) return null;
  return cmd;
}