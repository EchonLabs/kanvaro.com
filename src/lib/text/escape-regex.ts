/** Escape text before putting it in $regex or new RegExp(), so it matches literally. */
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
