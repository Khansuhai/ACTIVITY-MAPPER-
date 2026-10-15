import { ImportError } from './types';

/** Parses XML text with the platform DOMParser (the browser, or jsdom in tests). */
export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ImportError('The file is not valid XML.');
  }
  return doc;
}

/**
 * Elements are matched by local name in any namespace, because GPX/TCX/KML files in the wild use
 * many namespace prefixes (gpxtpx:, ns3:, gx:) or none at all.
 */
export function descendants(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', localName));
}

export function firstDescendant(parent: Document | Element, localName: string): Element | null {
  return parent.getElementsByTagNameNS('*', localName)[0] ?? null;
}

/** Direct child (not any descendant) with this local name. */
export function child(parent: Element, localName: string): Element | null {
  for (const el of Array.from(parent.children)) {
    if (el.localName === localName) return el;
  }
  return null;
}

export function text(el: Element | null): string | null {
  const value = el?.textContent?.trim();
  return value ? value : null;
}

export function num(el: Element | null): number | null {
  const value = text(el);
  if (value === null) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function time(el: Element | null): number | null {
  const value = text(el);
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
