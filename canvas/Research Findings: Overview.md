Research Findings: Overview

Purpose: Summarize the high-level feasibility and core considerations for forking Roo Code into a standalone web-based AI application.

Key Points

VS Code Server (Option 1)

Uses OpenVSCode-Server or code-server to host VS Code in the browser.

Minimal changes to Roo Code; leverages full IDE feature set including file explorer, terminal, extensions.

Drawbacks: Heavy IDE UI, less mobile-friendly; licensing must use pure OSS (e.g., VSCodium-based server).

Eclipse Theia (Option 2)

Web IDE framework with VS Code extension compatibility.

Allows customizing UI to be more chat-centric; preserves file, editor, and terminal components.

Caveats: Still a fairly heavy stack; some extension APIs may need testing.

Custom Web App (Option 3)

Fork Roo Code core into a headless Node service.

Build custom front-end with React, Monaco Editor, xterm.js, and file browser.

Most work but yields the most streamlined, mobile-responsive UI.

Supporting Elements

Monaco Editor: Embeddable code editor, open-source from VS Code.

xterm.js + node-pty: Browser terminal emulation and backend PTY.

MCP Marketplace: Roo’s extension/plugin system can drive tool integrations and marketplace functionality.

Local-First LLM Integration: Maintain modular model calls for privacy and cost control.

Next Steps

Deep-dive on each option: architecture, dependencies, pros/cons, estimated effort.

Identify any licensing or security concerns specific to each path.

(Proceed to detailed findings for Option 1 (VS Code Server)? Reply y to continue or n to pause.)

