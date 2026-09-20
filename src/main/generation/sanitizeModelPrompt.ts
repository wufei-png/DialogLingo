// A deliberately limited final prompt filter. This is applied after the
// editable template and excerpt titles/text have been rendered together.
const CREDENTIAL_TOKEN =
  /\b(?:sk-(?:proj-|ant-)?|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|xox[baprs]-|AIza|AKIA|ASIA)[A-Za-z0-9_-]{8,}\b/g
const AUTH_HEADER =
  /\b((?:Authorization|Proxy-Authorization|X-API-Key|API-Key|X-Auth-Token)\s*[:=]\s*)(?:["']?)(?:Bearer\s+|Basic\s+|Token\s+)?[^\s"',;]+/gi
const SECRET_ASSIGNMENT =
  /\b((?:[A-Z][A-Z0-9_]*_)?(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CLIENT_SECRET)\s*=\s*)["']?[^\s"',;]+/gi
const HOME_PATH =
  /(?:\/Users\/[^\s/\\"'<>:]+|\/home\/[^\s/\\"'<>:]+|[A-Za-z]:\\Users\\[^\s/\\"'<>:]+)(?:[/\\][^\s"'<>:;,)]*)?/g

export function sanitizeModelPrompt(prompt: string, redactBeforeRemoteSend: boolean) {
  if (!redactBeforeRemoteSend) {
    return prompt
  }

  return prompt
    .replace(AUTH_HEADER, '$1[redacted-secret]')
    .replace(SECRET_ASSIGNMENT, '$1[redacted-secret]')
    .replace(CREDENTIAL_TOKEN, '[redacted-secret]')
    .replace(HOME_PATH, '[redacted-home-path]')
}
