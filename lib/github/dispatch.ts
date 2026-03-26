/**
 * Dispatch a GitHub Actions workflow_dispatch event.
 *
 * Requires GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables.
 * Returns silently on success; throws on HTTP error or missing env vars.
 */
export async function dispatchWorkflow(
  workflow: string,
  inputs: Record<string, string> = {},
  ref = "main"
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error(
      "GitHub env vars not configured (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)"
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error dispatching ${workflow}: ${text}`);
  }
}
