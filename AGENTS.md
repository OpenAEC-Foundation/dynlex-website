# DynLex website

Keep application UI and behavior in DynLex. Reusable rendering and controls belong in dynlex-ui; compiler behavior belongs in dynlex. Build against the content-addressed packages in site/project.json, without sibling-checkout assumptions.

Use scripts/create-worktree.sh for repository-local worktrees. Keep source files under 1000 lines. No subagents unless requested. Run relevant tests; preserve independent fixtures. Use background browsers with Xvfb and muted audio. Report real errors to logs and generic errors to visitors. Fix root causes, without silent fallbacks.
