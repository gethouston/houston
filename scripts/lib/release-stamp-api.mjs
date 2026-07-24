// Thin GitHub REST + Linear GraphQL clients for the release stamp. Kept apart
// from the pure train logic (release-train.mjs) so that logic stays testable.

export function makeGithubClient(token) {
  return async function gh(path, init = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        ...(init.headers || {}),
      },
    });
    if (!res.ok)
      throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
}

export function makeLinearClient(apiKey) {
  return async function lin(query, variables = {}) {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });
    const data = await res.json();
    if (data.errors)
      throw new Error(`Linear: ${JSON.stringify(data.errors).slice(0, 300)}`);
    return data.data;
  };
}

export const ISSUE_FIELDS = `
  id identifier title description
  state { name type }
  project { name }
  labels { nodes { id name } }`;
