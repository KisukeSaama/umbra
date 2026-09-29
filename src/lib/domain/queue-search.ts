import "server-only";

import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import { media } from "@/lib/db/schema";
import { containsPattern } from "@/lib/domain/library";

/**
 * Where a queue row is searched, whichever table it lives in.
 *
 * The title and the original title, since a title can be looked up under the
 * name it was released with; the provider id typed whole, for the staff who
 * paste one; the note the staff left; and the name of anybody tied to the
 * row, whoever opened it and everybody waiting on it, since the name the staff
 * remember is not always the first one.
 *
 * Every word has to be found somewhere on the row (see `queueSearchTerms`).
 * The names are read as an existence rather than a join, so a row is never
 * repeated once per member who matches.
 */
export function queueSearchFilter(
  terms: string[],
  row: {
    /** The row's own id, which its followers point at. */
    id: AnyPgColumn;
    /** Whoever opened the row. */
    openedBy: AnyPgColumn;
    note: AnyPgColumn;
    /** The table of followers, and its two columns. */
    followers: { table: PgTable; row: AnyPgColumn; account: AnyPgColumn };
  },
): SQL | undefined {
  if (terms.length === 0) return undefined;
  const followers = row.followers;

  return and(
    ...terms.map((term) => {
      const pattern = containsPattern(term);
      return or(
        ilike(media.title, pattern),
        ilike(media.originalTitle, pattern),
        eq(media.providerId, term),
        ilike(row.note, pattern),
        sql`exists (
          select 1
            from account as a
           where a.username ilike ${pattern}
             and (a.id = ${row.openedBy}
                  or exists (
                    select 1
                      from ${followers.table}
                     where ${followers.row} = ${row.id}
                       and ${followers.account} = a.id
                  ))
        )`,
      );
    }),
  );
}
