export type ParsedBookmark = {
  url: string;
  title: string;
  addedAt: number | null;
  lastModified: number | null;
  icon: string | null;
  tags: string[];
  description: string | null;
  /** Root-first folder names, excluding the bookmark itself. */
  folderPath: string[];
};

export type ParsedFolder = {
  path: string[];
  addDate: number | null;
  isToolbar: boolean;
};

export type ParsedFile = {
  bookmarks: ParsedBookmark[];
  folders: ParsedFolder[];
  errors: string[];
  skipped: number;
};

function toTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Some exporters write milliseconds or microseconds; normalize to seconds.
  if (n > 1e14) return Math.floor(n / 1e6);
  if (n > 1e11) return Math.floor(n / 1e3);
  return Math.floor(n);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

const defaultParse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/**
 * Parses the Netscape Bookmark File Format. NEVER throws — every problem is
 * collected into `errors` so one bad entry cannot lose the other 19,999.
 *
 * The DOM parser is injectable so this runs unchanged in a Worker (native
 * DOMParser) and in Node tests (linkedom).
 */
export function parseNetscape(
  html: string,
  parse: (html: string) => Document = defaultParse,
): ParsedFile {
  const bookmarks: ParsedBookmark[] = [];
  const folders: ParsedFolder[] = [];
  const errors: string[] = [];
  let skipped = 0;

  if (html.trim() === '') {
    return { bookmarks, folders, errors: ['The file is empty.'], skipped: 0 };
  }

  let doc: Document;
  try {
    doc = parse(html);
  } catch (e) {
    return {
      bookmarks,
      folders,
      skipped: 0,
      errors: [`Could not parse the file as HTML: ${(e as Error).message}`],
    };
  }

  /**
   * Depth is derived from each element's <DL> ancestry rather than from
   * recursion, so unclosed tags degrade locally instead of corrupting the
   * whole tree.
   *
   * Because the Netscape format never closes <DT>, an HTML parser keeps the
   * <DT> open on the stack until something forces it shut. That means a
   * folder's <DL> commonly ends up nested *inside* the same <DT> as its
   * heading (a sibling of the <H3>) rather than following it as a sibling of
   * the <DT> — so both shapes have to be checked.
   */
  const headingFor = (dl: Element): Element | null => {
    const parent = dl.parentElement;
    if (parent?.tagName === 'DT') {
      const h3InParent = parent.querySelector(':scope > h3');
      if (h3InParent) return h3InParent;
    }
    const prev = dl.previousElementSibling;
    if (prev?.tagName === 'H3') return prev;
    if (prev?.tagName === 'DT') {
      const h3InPrev = prev.querySelector('h3');
      if (h3InPrev) return h3InPrev;
    }
    return null;
  };

  const pathOf = (el: Element): string[] => {
    const names: string[] = [];
    let current: Element | null = el.parentElement;
    while (current) {
      if (current.tagName === 'DL') {
        const heading = headingFor(current);
        if (heading?.textContent) names.unshift(heading.textContent.trim());
      }
      current = current.parentElement;
    }
    return names;
  };

  try {
    for (const h3 of Array.from(doc.querySelectorAll('h3'))) {
      const name = h3.textContent?.trim();
      if (!name) continue;
      folders.push({
        path: [...pathOf(h3), name],
        addDate: toTimestamp(h3.getAttribute('ADD_DATE') ?? h3.getAttribute('add_date')),
        isToolbar:
          (h3.getAttribute('PERSONAL_TOOLBAR_FOLDER') ??
            h3.getAttribute('personal_toolbar_folder')) === 'true',
      });
    }

    for (const anchor of Array.from(doc.querySelectorAll('a'))) {
      const href = anchor.getAttribute('HREF') ?? anchor.getAttribute('href');

      if (!href || href.trim() === '') {
        skipped++;
        continue;
      }
      // Firefox pseudo-URLs are saved searches, not real bookmarks.
      if (href.startsWith('place:')) {
        skipped++;
        continue;
      }
      if (href.startsWith('javascript:')) {
        skipped++;
        continue;
      }

      const attr = (name: string) =>
        anchor.getAttribute(name.toUpperCase()) ?? anchor.getAttribute(name.toLowerCase());

      // A <DD> description follows its <DT> as a sibling.
      const dt = anchor.closest('dt');
      const next = dt?.nextElementSibling;
      const description = next?.tagName === 'DD' ? next.textContent?.trim() || null : null;

      bookmarks.push({
        url: href,
        title: anchor.textContent?.trim() || href,
        addedAt: toTimestamp(attr('add_date')),
        lastModified: toTimestamp(attr('last_modified')),
        icon: attr('icon'),
        tags: parseTags(attr('tags')),
        description,
        folderPath: pathOf(anchor),
      });
    }
  } catch (e) {
    errors.push(`Stopped early after an unexpected structure: ${(e as Error).message}`);
  }

  if (bookmarks.length === 0 && errors.length === 0 && doc.querySelectorAll('a').length === 0) {
    errors.push('No bookmarks found. Is this a bookmark export file?');
  }

  return { bookmarks, folders, errors, skipped };
}
