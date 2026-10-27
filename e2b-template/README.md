# E2B template: Claude Code on Pollinations

Build and publish with the E2B CLI:

```bash
cd e2b-template
e2b template build --name claude-code-pollinations
```

Then set `E2B_TEMPLATE_ID` to the published template id.

## Notes
- Claude Code is pointed at Pollinations via `ANTHROPIC_BASE_URL=https://gen.pollinations.ai`
  and `ANTHROPIC_AUTH_TOKEN=<user sk_ key>` (set per sandbox at creation).
- Use `ANTHROPIC_AUTH_TOKEN`, not `ANTHROPIC_API_KEY`.
- Network policy is applied after creation via PUT /sandboxes/{id}/network.