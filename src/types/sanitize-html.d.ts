declare module "sanitize-html" {
  export type Attributes = Record<string, string>;

  export interface TransformTagResult {
    tagName: string;
    attribs?: Attributes;
    text?: string;
  }

  export type TransformTag = (
    tagName: string,
    attribs: Attributes,
  ) => TransformTagResult;

  // AllowedStyles: map of tag (or "*" for all) to map of CSS property to array of allowed values (as regexes)
  export interface AllowedStylesConfig {
    [tag: string]: {
      [cssProperty: string]: RegExp[];
    };
  }

  export interface IOptions {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowedSchemes?: string[];
    allowedSchemesByTag?: Record<string, string[]>;
    allowProtocolRelative?: boolean;
    disallowedTagsMode?: "discard" | "escape" | "recursiveEscape";
    transformTags?: Record<string, string | TransformTag>;
    textFilter?: (text: string) => string;
    // NEW: allowedStyles for validating CSS property values with regex patterns
    allowedStyles?: AllowedStylesConfig;
  }

  export default function sanitizeHtml(
    dirty: string,
    options?: IOptions,
  ): string;
}
