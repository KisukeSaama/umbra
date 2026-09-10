import "server-only";

import { cache } from "react";

import {
  decorate,
  titleDetail,
  type CatalogResult,
} from "@/lib/domain/catalog";
import { crewFrom, filmography, signedBy } from "@/lib/domain/filmography";
import type {
  MediaKind,
  PersonRef,
  PersonRole,
} from "@/lib/providers/metadata";
import {
  ANIMATION_GENRE_ID,
  profileUrl,
  tmdbProvider,
} from "@/lib/providers/tmdb";

/**
 * The people behind a title, and the titles behind a person.
 *
 * Nothing here is stored: a person is read from the provider for the page that
 * shows them, exactly like a title, and Janus keeps the only cache.
 */

export type PersonCard = {
  personId: string;
  name: string;
  photoUrl: string | null;
};

export type CastCard = PersonCard & {
  character: string | null;
  voice: boolean;
};

export type TitleCrew = { leads: PersonCard[]; cast: CastCard[] };

const NO_CREW: TitleCrew = { leads: [], cast: [] };

function cardOf(person: PersonRef): PersonCard {
  return {
    personId: person.personId,
    name: person.name,
    photoUrl: profileUrl(person.profilePath),
  };
}

/**
 * Who signs a title and who is in it.
 *
 * The genres decide whether the cast lends voices, and they come from the
 * details the page is already asking for, memoised for the request. A provider
 * that cannot be reached leaves the title without a byline or a cast rather
 * than without a page.
 */
export const titleCrew = cache(async function titleCrew(
  kind: MediaKind,
  providerId: string,
  language?: string,
): Promise<TitleCrew> {
  try {
    const [credits, detail] = await Promise.all([
      tmdbProvider.credits(kind, providerId, language),
      titleDetail(kind, providerId, language),
    ]);
    const animated = detail.genres.some(
      (genre) => genre.id === ANIMATION_GENRE_ID,
    );
    const crew = crewFrom(credits, animated);
    return {
      leads: crew.leads.map(cardOf),
      cast: crew.cast.map((member) => ({
        ...cardOf(member),
        character: member.character,
        voice: member.voice,
      })),
    };
  } catch (error) {
    console.warn("[people] credits unavailable", error);
    return NO_CREW;
  }
});

export type PersonPage = PersonCard & {
  groups: { role: PersonRole; titles: CatalogResult[] }[];
};

/**
 * One person, and their work grouped by what they did on it. Every title is
 * decorated in one pass, so the page costs four queries whatever the number
 * of shelves.
 */
export const personPage = cache(async function personPage(
  personId: string,
  language?: string,
): Promise<PersonPage> {
  const person = await tmdbProvider.person(personId, language);
  const groups = filmography(person.credits, person.knownFor);
  const decorated = await decorate(groups.flatMap((group) => group.titles));

  const byKey = new Map(
    decorated.map((result) => [`${result.kind}:${result.providerId}`, result]),
  );
  return {
    ...cardOf(person),
    groups: groups.map((group) => ({
      role: group.role,
      titles: group.titles
        .map((title) => byKey.get(`${title.kind}:${title.providerId}`))
        .filter((title): title is CatalogResult => title !== undefined),
    })),
  };
});

/** The other titles a person signed, for the page of one of them. */
export async function moreFrom(
  personId: string,
  except: { kind: MediaKind; providerId: string },
  language?: string,
): Promise<CatalogResult[]> {
  const person = await tmdbProvider.person(personId, language);
  return decorate(signedBy(person.credits, except));
}
