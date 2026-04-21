declare module 'sanitize-html' {
  export type Attributes = Record<string, string>

  export interface TransformTagResult {
    tagName: string
    attribs?: Attributes
    text?: string
  }

  export type TransformTag = (tagName: string, attribs: Attributes) => TransformTagResult

  export interface IOptions {
    allowedTags?: string[]
    allowedAttributes?: Record<string, string[]>
    allowedSchemes?: string[]
    allowedSchemesByTag?: Record<string, string[]>
    allowProtocolRelative?: boolean
    disallowedTagsMode?: 'discard' | 'escape' | 'recursiveEscape'
    transformTags?: Record<string, string | TransformTag>
    textFilter?: (text: string) => string
  }

  export default function sanitizeHtml(dirty: string, options?: IOptions): string
}
