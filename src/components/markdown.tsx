import { cn } from "cn";
import { Fragment } from "react";

import { ExternalLinkIcon } from "@/components/icons";
import { parseMarkdown, type BlockNode, type InlineNode } from "@/lib/markdown";

/**
 * An announcement body, set as written.
 *
 * The tree comes from `@/lib/markdown`, so every element on screen is one this
 * file wrote: there is no HTML string anywhere in the path. The component has
 * no state and no hook, which lets the feed render it on the server and the
 * admin composer render the very same thing, live, in a preview.
 *
 * Sizes are relative so a note reads at the size of whatever holds it, and the
 * rhythm follows the reading column in `docs/DESIGN.md`: paragraphs breathe,
 * headings sit closer to what they introduce than to what came before.
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseMarkdown(content);
  if (blocks.length === 0) return null;

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: BlockNode }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p>
          <Inline nodes={block.children} />
        </p>
      );

    case "heading":
      return <Heading level={block.level} nodes={block.children} />;

    case "list":
      return block.ordered ? (
        <ol
          start={block.start}
          className="marker:text-muted-foreground list-decimal space-y-1 pl-5 tabular-nums"
        >
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="marker:text-muted-foreground list-disc space-y-1 pl-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} />
            </li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote className="border-border/60 text-muted-foreground space-y-3 border-l-2 pl-4 italic">
          {block.children.map((child, index) => (
            <Block key={index} block={child} />
          ))}
        </blockquote>
      );

    case "codeBlock":
      return (
        <pre className="bg-muted/60 border-border/60 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed not-italic">
          <code>{block.value}</code>
        </pre>
      );

    case "rule":
      return <hr className="border-border/60" />;
  }
}

/**
 * Three levels, all under the note's own title.
 *
 * A body never outranks the heading of the entry it belongs to, so the largest
 * one here is an h3 set barely above the text around it.
 */
function Heading({ level, nodes }: { level: 1 | 2 | 3; nodes: InlineNode[] }) {
  const content = <Inline nodes={nodes} />;
  if (level === 1)
    return (
      <h3 className="pt-1 text-base font-semibold tracking-tight">{content}</h3>
    );
  if (level === 2)
    return <h4 className="pt-1 text-sm font-semibold">{content}</h4>;
  return (
    <h5 className="text-muted-foreground pt-1 text-xs font-medium tracking-wide uppercase">
      {content}
    </h5>
  );
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <Span key={index} node={node} />
      ))}
    </>
  );
}

function Span({ node }: { node: InlineNode }) {
  switch (node.type) {
    case "text":
      return <Fragment>{node.value}</Fragment>;

    case "break":
      return <br />;

    case "code":
      return (
        <code className="bg-muted/60 rounded px-1 py-0.5 font-mono text-[0.85em] not-italic">
          {node.value}
        </code>
      );

    case "strong":
      return (
        <strong className="font-semibold">
          <Inline nodes={node.children} />
        </strong>
      );

    case "emphasis":
      return (
        <em>
          <Inline nodes={node.children} />
        </em>
      );

    case "link": {
      // Leaving Umbra is worth showing; moving inside it is not.
      const external = /^(https?|mailto):/i.test(node.href);
      return (
        <a
          href={node.href}
          {...(external
            ? { target: "_blank", rel: "noreferrer noopener" }
            : null)}
          className="text-primary hover:text-primary/80 focus-visible:ring-ring/50 rounded-sm underline underline-offset-2 transition-colors outline-none focus-visible:ring-3"
        >
          <Inline nodes={node.children} />
          {external ? (
            <ExternalLinkIcon
              data-icon="inline-end"
              className="ml-0.5 inline size-3 align-baseline"
            />
          ) : null}
        </a>
      );
    }
  }
}
