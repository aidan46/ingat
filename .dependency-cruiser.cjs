/**
 * Enforces the three-domain boundary from docs/ARCHITECTURE.md mechanically.
 * Rules fire only once lib/ has files; an empty lib/ is fine.
 */
module.exports = {
  forbidden: [
    {
      name: "scheduling-stays-deterministic",
      comment:
        "lib/scheduling/** is the deterministic domain: no LLM (@anthropic-ai/sdk) and no lib/agents imports.",
      severity: "error",
      from: { path: "^lib/scheduling" },
      to: { path: "^(lib/agents|node_modules/@anthropic-ai/sdk)" },
    },
    {
      name: "agents-dont-schedule",
      comment:
        "lib/agents/** is the LLM domain: no scheduler (ts-fsrs) and no lib/scheduling imports.",
      severity: "error",
      from: { path: "^lib/agents" },
      to: { path: "^(lib/scheduling|node_modules/ts-fsrs)" },
    },
    {
      name: "sdk-confined-to-llm",
      comment:
        "Only lib/llm/** may import a provider SDK; agents use the LLMProvider port.",
      severity: "error",
      from: { pathNot: "^lib/llm" },
      to: { path: "node_modules/@anthropic-ai/sdk" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    // doNotFollow keeps node_modules OUT of traversal but KEEPS the edges TO
    // packages in the graph, so the @anthropic-ai/sdk / ts-fsrs boundary
    // clauses can match. Excluding node_modules here would strip those edges.
    doNotFollow: { path: "(^|/)node_modules/" },
    exclude: {
      path: "(^|/)(\\.next|coverage)/|^app/generated/",
    },
  },
};
