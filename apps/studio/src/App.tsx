import { createResolver, createTokenDocument, parseTokenSet } from "@okeytokey/core";
import { DTCG_TOKEN_TYPES } from "@okeytokey/schema";
import { TokenTypeLabel } from "@okeytokey/ui";

/**
 * Phase 1 shell. Parses and resolves a demo token set through the real core
 * engine (schema -> core -> ui chain); the full editor arrives in Phase 2.
 */

const DEMO_SET = `{
  "colors": {
    "$type": "color",
    "blue": { "$value": "#3b82f6" },
    "primary": { "$value": "{colors.blue}" }
  },
  "spacing": {
    "$type": "dimension",
    "base": { "$value": "4px" },
    "double": { "$value": "{spacing.base} * 2" }
  }
}`;

const resolver = createResolver(createTokenDocument([parseTokenSet("demo", DEMO_SET)]));
const resolved = resolver.resolveAll();

export function App() {
  return (
    <main className="shell">
      <h1>okeytokey</h1>
      <p className="tagline">Design tokens, decided.</p>
      <p data-testid="token-type-count">{DTCG_TOKEN_TYPES.length} token types supported</p>
      <ul className="token-types">
        {DTCG_TOKEN_TYPES.map((type) => (
          <li key={type}>
            <TokenTypeLabel type={type} />
          </li>
        ))}
      </ul>
      <h2>Live resolver demo</h2>
      <table className="demo-tokens" data-testid="resolved-tokens">
        <thead>
          <tr>
            <th>Token</th>
            <th>Raw value</th>
            <th>Resolved</th>
          </tr>
        </thead>
        <tbody>
          {[...resolved.resolved.entries()].map(([path, token]) => (
            <tr key={path}>
              <td>
                <code>{path}</code>
              </td>
              <td>
                <code>{String(token.token.value)}</code>
              </td>
              <td data-testid={`resolved-${path}`}>
                <code>{String(token.value)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
