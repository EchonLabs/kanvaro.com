import sanitizeHtml from "sanitize-html";

const HTML_EMPTY_BLOCK_RE =
  /<(p|h[1-6])(?:\s+[^>]*)?>\s*(?:&nbsp;|\s|<br\s*\/?>)*<\/(p|h[1-6])>/gi;
const HTML_MANY_BREAKS_RE = /(?:<br\s*\/?>\s*){3,}/gi;

function normalizeSanitizedHtml(html: string): string {
  let normalized = html
    .replace(/\u00a0/g, " ")
    .replace(HTML_MANY_BREAKS_RE, "<br><br>");

  // Remove empty paragraphs/headings that only contain whitespace, &nbsp;, and/or <br>
  normalized = normalized.replace(HTML_EMPTY_BLOCK_RE, "");

  // Collapse whitespace between block tags a bit (keeps intentional single newlines irrelevant in HTML)
  normalized = normalized.replace(/>\s+</g, "><");

  return normalized.trim();
}

export function sanitizeTaskDescriptionHtml(
  input: unknown,
): string | undefined {
  if (typeof input !== "string") return undefined;

  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const sanitized = sanitizeHtml(trimmed, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "a",
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "span",
      "font",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      // Added style and align to allow more formatting options for the <p> tag.
      p: ["style", "align"],
      span: ["style"],
      font: ["size", "face", "color"],
      // Allow list-specific attributes
      ul: ["style", "type"],
      ol: ["style", "type"],
      li: ["style"],
    },
    // NEW: Allowlist safe CSS properties with strict regex validation
    // This prevents XSS while allowing formatting to be preserved
    allowedStyles: {
      "*": {
        // text-align: only allow the safe values
        "text-align": [/^(left|right|center|justify)$/],
        // font-size: allow px, em, rem, pt, % with reasonable numeric ranges
        "font-size": [/^\d+(\.\d+)?(px|em|rem|pt|%)$/],
        // font-family: allow standard font names and quoted family names
        "font-family": [/^[a-zA-Z\s,'"_-]+$/],
        // color: allow hex colors, rgb, and rgba
        color: [
          /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgb\([0-9,\s]+\)|rgba\([0-9,\s.]+\))$/i,
        ],
        // background-color: for spans with background
        "background-color": [
          /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgb\([0-9,\s]+\)|rgba\([0-9,\s.]+\))$/i,
        ],
        // list-style-type: preserve custom list styles
        "list-style-type": [
          /^(disc|circle|square|decimal|decimal-leading-zero|lower-alpha|upper-alpha|lower-roman|upper-roman|lower-greek|georgian|armenian)$/,
        ],
        // padding-left: for indented lists
        "padding-left": [/^\d+(\.\d+)?(px|em|rem)$/],
        // margin: for spacing (controlled)
        margin: [/^\d+(\.\d+)?(px|em|rem)$/],
        // line-height: for readability
        "line-height": [/^[0-9]{1,2}(\.\d+)?$/],
        // font-weight: for bold text (rare if not using <strong>, but allow it)
        "font-weight": [/^(normal|bold|lighter|[1-9]00)$/],
        // font-style: for italic (rare if not using <em>, but allow it)
        "font-style": [/^(normal|italic|oblique)$/],
        // text-decoration: for underline (rare if not using <u>, but allow it)
        "text-decoration": [/^(none|underline|overline|line-through)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      // Common paste sources wrap paragraphs in <div>
      div: "p",
      b: "strong",
      i: "em",
      // Convert font tag: preserve size/face/color attributes
      font: (tagName: string, attribs: Record<string, string>) => {
        const safeAttribs: Record<string, string> = {};

        // Preserve size attribute
        if (attribs.size) {
          safeAttribs.size = attribs.size;
        }

        // Preserve face attribute (font family)
        if (attribs.face) {
          safeAttribs.face = attribs.face;
        }

        // Preserve color attribute
        if (attribs.color) {
          safeAttribs.color = attribs.color;
        }

        return { tagName, attribs: safeAttribs };
      },
      a: (tagName: string, attribs: Record<string, string>) => {
        const href =
          typeof attribs.href === "string" ? attribs.href.trim() : "";

        // Drop javascript: and other suspicious protocols.
        // sanitize-html already filters schemes, but this also handles relative/empty safely.
        const safeAttribs: Record<string, string> = {};
        if (href) safeAttribs.href = href;

        // If a target is supplied, enforce rel for security.
        if (attribs.target === "_blank") {
          safeAttribs.target = "_blank";
          safeAttribs.rel = "noopener noreferrer";
        }

        return { tagName, attribs: safeAttribs };
      },
      img: (tagName: string, attribs: Record<string, string>) => {
        const src = typeof attribs.src === "string" ? attribs.src.trim() : "";
        if (!src) {
          return { tagName: "span", text: "" };
        }

        const safeAttribs: Record<string, string> = { src };
        if (typeof attribs.alt === "string" && attribs.alt.trim())
          safeAttribs.alt = attribs.alt.trim();
        if (typeof attribs.title === "string" && attribs.title.trim())
          safeAttribs.title = attribs.title.trim();
        if (typeof attribs.width === "string" && attribs.width.trim())
          safeAttribs.width = attribs.width.trim();
        if (typeof attribs.height === "string" && attribs.height.trim())
          safeAttribs.height = attribs.height.trim();

        return { tagName, attribs: safeAttribs };
      },
    },
    textFilter: (text: string) => text.replace(/\u00a0/g, " "),
  });

  const normalized = normalizeSanitizedHtml(sanitized);
  return normalized.length > 0 ? normalized : undefined;
}
