@AGENTS.md

## Design System
Always read design.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.

## Project Conventions

- **Dev server port**: `npm run dev` defaults to 3000, but auto-picks the next free port (3001, ...) if it's taken. Check the terminal output for the actual URL rather than assuming 3000.
- **Layout is mobile-first**: below the `sm:` breakpoint the app is edge-to-edge (no border/shadow/rounded corners, no max-width) since the real target is a mobile app. The bordered/rounded/max-w-[460px] "phone mockup" only appears at `sm:` and up, purely so it's usable to develop/preview on a wide desktop browser. See design.md → Layout.
- **Deploy**: pushing to `main` auto-deploys to Vercel via the connected GitHub integration (confirmed working 2026-07-13) → https://skillsns.vercel.app. A manual `vercel --prod --yes` from the project dir still works as a fallback if needed.
- **Backend integration status**: the app is currently all frontend mock data (no persistence, canned agent replies, client-generated slugs/versions). See `BACKEND_HANDOFF.md` before assuming any part of the flow is backed by a real API.

## Figma ↔ Code Sync

This project has both the Figma MCP and the html.to.design MCP connected, used together as a manual (prompt-triggered, not automatic) two-way loop against the `skillsns` Figma file:

- **Code → Figma**: fetch the rendered HTML/CSS of a screen (e.g. via `curl` against the local dev server) and pass it to `html.to.design`'s `import-html` tool to bring it into the Figma file as a new frame. Requires the html.to.design plugin panel to be open in the Figma desktop app (not just the file) with its MCP tab showing "Ready" — otherwise calls time out or report "not connected."
- **Figma → Code**: after the user edits a frame in Figma, use the Figma MCP's `get_design_context` on that node id to read back the current state, then hand-translate the relevant diff into the actual component files (this project has no Figma Code Connect mappings set up, so there's no automatic node → component linkage — the translation is manual/judgment-based).
- Trigger phrases the user tends to use: "이 화면 피그마로 가져와줘" (code → Figma) and "이 프레임 코드에 반영해줘" (Figma → code).
