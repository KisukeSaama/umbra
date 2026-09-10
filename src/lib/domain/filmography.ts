import type {
  CastCredit,
  MediaKind,
  MediaSummary,
  PersonCredit,
  PersonRef,
  PersonRole,
  TitleCredits,
} from "@/lib/providers/metadata";

/**
 * How credits become something to browse by. Pure, so the rules can be read
 * and tested without a gateway: the provider says who did what, this decides
 * what a page shows of it and in which order.
 */

/** A shelf is a rail, not an archive: the best known twenty say who someone is. */
export const SHELF_SIZE = 20;

/** Enough faces to recognise a cast without scrolling through the extras. */
export const CAST_SIZE = 20;

/** More than three names in a byline is a list, and the list is the cast rail. */
const LEAD_SIZE = 3;

/** The default order of a person's shelves. */
const ROLE_ORDER: PersonRole[] = [
  "cast",
  "voice",
  "director",
  "creator",
  "writer",
];

/**
 * What a person is known for comes first: a director who once played a
 * cameo is looked up for what they directed.
 */
const LEADING_ROLES: Record<string, PersonRole[]> = {
  Directing: ["director", "creator"],
  Writing: ["writer", "creator"],
  Creator: ["creator", "director"],
};

export type FilmographyGroup = { role: PersonRole; titles: MediaSummary[] };

export function filmography(
  credits: PersonCredit[],
  knownFor: string | null,
): FilmographyGroup[] {
  const leading = LEADING_ROLES[knownFor ?? ""] ?? [];
  const order = [
    ...leading,
    ...ROLE_ORDER.filter((role) => !leading.includes(role)),
  ];
  return order
    .map((role) => ({
      role,
      titles: rank(
        credits.filter((credit) => credit.role === role),
        null,
      ),
    }))
    .filter((group) => group.titles.length > 0);
}

/**
 * The titles someone signed, other than the one being looked at: what the
 * title page offers under their name.
 */
export function signedBy(
  credits: PersonCredit[],
  except: { kind: MediaKind; providerId: string },
): MediaSummary[] {
  return rank(
    credits.filter(
      (credit) => credit.role === "director" || credit.role === "creator",
    ),
    keyOf(except),
  );
}

/**
 * The byline and the cast of one title.
 *
 * `animated` is the title's own genre speaking: in a drawn title every role is
 * a voice, which the provider only sometimes writes into the character name.
 */
export function crewFrom(
  credits: TitleCredits,
  animated: boolean,
): { leads: PersonRef[]; cast: CastCredit[] } {
  return {
    leads: credits.leads.slice(0, LEAD_SIZE),
    cast: credits.cast
      .slice(0, CAST_SIZE)
      .map((member) => ({ ...member, voice: member.voice || animated })),
  };
}

/**
 * One title once, the most seen first.
 *
 * The vote count stands for how widely a title was seen, which is what "known
 * for" means; popularity is this week's buzz and would put a trailer ahead of
 * a classic. Titles nobody has rated yet, announced but not out, go last.
 */
function rank(credits: PersonCredit[], exceptKey: string | null) {
  const seen = new Set<string>(exceptKey ? [exceptKey] : []);
  const titles: MediaSummary[] = [];
  for (const { summary } of credits) {
    const key = keyOf(summary);
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(summary);
  }
  return titles
    .sort((a, b) => b.voteCount - a.voteCount || b.popularity - a.popularity)
    .slice(0, SHELF_SIZE);
}

function keyOf(summary: Pick<MediaSummary, "kind" | "providerId">) {
  return `${summary.kind}:${summary.providerId}`;
}
