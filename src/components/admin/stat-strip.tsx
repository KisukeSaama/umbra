/**
 * The state of the place, in one row.
 *
 * The same shape as the week strip on the home page, because it answers the
 * same kind of question: a large tabular figure over a small label, cells
 * divided by hairlines, no card per figure and no gauge. What is counted here
 * is work waiting, so a zero is worth showing, unlike on the member side where
 * an empty week simply removes the strip.
 *
 * It wraps rather than scrolls: on a phone the figures fall into two columns
 * and stay readable, instead of hiding the last three off the right edge. Each
 * cell draws its own leading hairlines and pulls them back under the outer
 * border, so the grid stays right at two, three or six columns and a last row
 * that is not full leaves no stray line behind it.
 *
 * The label comes first in the markup, because a description list is read as
 * term then definition and nothing else is valid inside a `dl`. The figure is
 * still the line on top: the cell reverses its own column, so what is read and
 * what is seen agree without the markup being wrong.
 */
export function StatStrip({
  stats,
}: {
  stats: { label: string; value: number | string }[];
}) {
  if (stats.length === 0) return null;

  return (
    <dl className="border-border/60 grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border-border/60 -mt-px -ml-px flex flex-col-reverse border-t border-l px-4 py-3"
        >
          <dt className="text-muted-foreground truncate text-xs">
            {stat.label}
          </dt>
          <dd className="text-xl font-semibold tabular-nums sm:text-2xl">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
