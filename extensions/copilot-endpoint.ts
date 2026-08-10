/**
 * copilot-endpoint: pin the GitHub Copilot provider to the API host that your
 * Copilot token was actually issued for.
 *
 * Background — the bug this works around (pi 0.83.0):
 *
 *   The Copilot access token carries the host it is valid for, e.g.
 *   `proxy-ep=proxy.business.githubcopilot.com`. pi's Copilot OAuth handler
 *   (`toAuth`) turns that into `https://api.business.githubcopilot.com` and
 *   `ModelRuntime.prepareRequest` copies it onto the model. Normal turns
 *   therefore hit the right host.
 *
 *   Summarization/compaction requests do NOT: `AgentSession` resolves auth up
 *   front (`_getSummarizationRequestAuth`) but keeps only `apiKey`/`headers`,
 *   dropping `baseUrl`, then passes that `apiKey` explicitly into the stream
 *   call. In `resolveProviderAuth`, an explicit `apiKey` short-circuits to the
 *   API-key branch, which returns no `baseUrl`, so the request falls back to
 *   the catalog default `https://api.individual.githubcopilot.com`.
 *
 *   A business/enterprise token sent to the individual host is answered with
 *   HTTP 421, surfacing as:
 *     "compaction failed: Turn prefix summarization failed: 421 Misdirected Request"
 *
 * Fix: override the provider's baseUrl with the token-derived host so the
 * catalog default is correct on both paths. Affects manual `/compact`, pi's
 * auto-compaction, and the context-cap extension alike.
 */
import {
  readStoredCredential,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "github-copilot";
const DEFAULT_BASE_URL = "https://api.individual.githubcopilot.com";

/** `proxy-ep=proxy.business.githubcopilot.com` -> `https://api.business.githubcopilot.com` */
function baseUrlFromToken(token: string): string | undefined {
  const proxyHost = token.match(/proxy-ep=([^;]+)/)?.[1];
  if (!proxyHost) return undefined;
  return `https://${proxyHost.replace(/^proxy\./, "api.")}`;
}

function hostname(input: string): string | undefined {
  try {
    const url = input.includes("://")
      ? new URL(input)
      : new URL(`https://${input}`);
    return url.hostname;
  } catch {
    return undefined;
  }
}

function resolveCopilotBaseUrl(): string | undefined {
  const credential = readStoredCredential(PROVIDER_ID);
  if (credential?.type !== "oauth") return undefined;

  const fromToken = baseUrlFromToken(credential.access);
  if (fromToken) return fromToken;

  // Enterprise fallback, mirroring pi's own getGitHubCopilotBaseUrl().
  const enterpriseUrl = credential.enterpriseUrl;
  if (typeof enterpriseUrl === "string" && enterpriseUrl) {
    const domain = hostname(enterpriseUrl);
    if (domain) return `https://copilot-api.${domain}`;
  }
  return undefined;
}

export default function (pi: ExtensionAPI) {
  const baseUrl = resolveCopilotBaseUrl();
  if (!baseUrl || baseUrl === DEFAULT_BASE_URL) return;
  pi.registerProvider(PROVIDER_ID, { baseUrl });
}
