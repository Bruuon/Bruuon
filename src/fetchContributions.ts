import type { Cell } from "./types";

// ─── GraphQL API (primary method, requires token) ──────────────────────

type GraphQLRes = {
  data?: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          weeks: {
            contributionDays: {
              contributionCount: number;
              contributionLevel: string;
              weekday: number;
              date: string;
            }[];
          }[];
        };
      };
    };
  };
  errors?: { message: string }[];
};

/**
 * Fetch contribution data using GitHub's GraphQL API.
 * Requires a personal access token with `user:read` scope.
 */
export const fetchContributions = async (
  username: string,
  githubToken: string,
): Promise<Cell[]> => {
  const query = /* GraphQL */ `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                weekday
                date
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "superprofile",
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));

  const json = (await res.json()) as GraphQLRes;

  if (json.errors?.[0]) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error("No data returned from GitHub API");

  const weeks =
    json.data.user.contributionsCollection.contributionCalendar.weeks;

  return weeks.flatMap(({ contributionDays }, x) =>
    contributionDays.map((d) => ({
      x,
      y: d.weekday,
      date: d.date,
      count: d.contributionCount,
      level: parseLevel(d.contributionLevel),
    })),
  );
};

// ─── HTML scraping (fallback, no token needed) ─────────────────────────

/**
 * Fetch contribution data by scraping GitHub's public contributions page.
 * No authentication required, but may be rate-limited.
 * Does NOT provide exact contribution counts (only level 0-4).
 */
export const fetchContributionsHtml = async (
  username: string,
): Promise<Cell[]> => {
  const res = await fetch(
    `https://github.com/users/${username}/contributions`,
    { headers: { "User-Agent": "superprofile" } },
  );

  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));

  const html = await res.text();
  const cells: { date: string; level: number }[] = [];
  const re = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    cells.push({ date: m[1], level: Number(m[2]) });
  }

  if (cells.length === 0) throw new Error("No contribution cells found");

  const origin = new Date(cells[0].date);

  return cells.map(({ date, level }) => {
    const d = new Date(date);
    const days = Math.round((d.getTime() - origin.getTime()) / 86_400_000);
    return {
      x: Math.floor(days / 7),
      y: d.getUTCDay(),
      date,
      count: 0,
      level: level as Cell["level"],
    };
  });
};

// ─── Helpers ────────────────────────────────────────────────────────────

const parseLevel = (level: string): Cell["level"] => {
  switch (level) {
    case "FOURTH_QUARTILE":
      return 4;
    case "THIRD_QUARTILE":
      return 3;
    case "SECOND_QUARTILE":
      return 2;
    case "FIRST_QUARTILE":
      return 1;
    default:
      return 0;
  }
};
