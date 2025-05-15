Detailed Findings: Option 2 – Eclipse Theia

1. Architecture

Core Framework: Use Eclipse Theia as the base web IDE platform, running a Theia backend server on Linux and serving a web client.

Roo Code Extension: Install Roo Code (from Open VSX) into Theia, leveraging its compatibility layer for VS Code extensions.

Access: Users connect via browser; Theia provides the file explorer, editor, terminal, and extension hosting.

[Browser] <--HTTPS--> [Theia Server + Roo Code]

2. Feature Coverage

Chat Interface: Roo Code’s webview panel functions inside Theia’s extension host, providing chat, tool invocation, and streaming.

Editor & Explorer: Built-in Monaco editor and file tree; customizable layout to emphasize chat pane.

Terminal: Integrated terminal via xterm.js; Theia’s default terminal plugin supports PTY.

Extensions & MCP: Full Theia extension support; MCP tools from Roo Code remain functional.

3. Pros & Cons

Pros

Cons

✅ Supports VS Code extensions (high compatibility)

❌ Slightly lighter than VS Code but still a full web IDE stack

✅ Customizable UI – can hide panels to focus on chat

❌ Requires Theia build/config; learning curve for Theia specifics

✅ Open-source (EPL/Polyform) and community-driven

❌ Potential API gaps—rare edge cases with some VS Code APIs

4. Implementation Steps

Set up Theia using Theia’s Yeoman generator or Docker image on Linux.

Configure Open VSX registry and install Roo Code into Theia.

Customize layout: modify Theia’s frontend to open Roo chat panel by default and hide unnecessary views.

Secure server: configure TLS and proxy authentication.

Test features: chat panel, file edits, terminal commands, extension interactions.

5. Effort Estimate

Setup & Build: 2–3 days (Theia backend, extension install, custom build).

UI Customization: 1–2 days (layout tweaks, theming).

Testing & Deployment: 1–2 days (feature validation, security setup).

(Proceed to Option 3: Custom Web App detailed canvas? Reply y to continue or n to finish.)

