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
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    exclude: {
      path: "(^|/)(\\.next|node_modules|coverage)/|^app/generated/",
    },
  },
};
