import type { TokenDocument } from "@okeytokey/core";

import { assembleContext } from "./context.js";
import { parseProposal, type ProposalParseResult } from "./proposal.js";
import type { AiProvider } from "./provider.js";

/**
 * The provider contract: checks every adapter must pass, run against real
 * fixtures in each provider's test suite. Kept in src (not test files) so
 * future adapters in other packages can import it.
 */

export interface ContractCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export async function runProviderContract(
  provider: AiProvider,
  document: TokenDocument,
): Promise<ContractCheck[]> {
  const checks: ContractCheck[] = [];

  const capabilities = provider.capabilities();
  checks.push({
    name: "capabilities",
    ok: typeof capabilities.local === "boolean",
    detail: `local=${String(capabilities.local)} structuredOutput=${String(capabilities.structuredOutput)}`,
  });

  const connection = await provider.testConnection();
  checks.push({
    name: "connection",
    ok: connection.ok,
    detail: connection.detail,
  });
  if (!connection.ok) return checks;

  const context = assembleContext(document, [document.sets.keys().next().value ?? ""]);
  let parsed: ProposalParseResult | undefined;
  try {
    const raw = await provider.generateProposal({
      task: "generate-semantic-tokens",
      instruction: "Contract check: propose at least one operation.",
      context,
    });
    parsed = parseProposal(raw.text);
  } catch (error) {
    checks.push({
      name: "generateProposal",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return checks;
  }

  checks.push({
    name: "proposal-parses",
    ok: parsed.ok,
    detail: parsed.ok
      ? `${String(parsed.proposal.operations.length)} operation(s)`
      : `${parsed.failure.reason}: ${parsed.failure.detail}`,
  });

  return checks;
}
