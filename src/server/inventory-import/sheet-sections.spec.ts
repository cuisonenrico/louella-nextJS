import {
  sectionForRow,
  isIgnoredLabel,
  pageForRow,
  typeForPage,
  suggestedTypeFor,
} from './sheet-sections';

describe('pageForRow', () => {
  it('advances to the page named by a PAGE header', () => {
    expect(pageForRow('PAGE 2', 1)).toBe(2);
  });

  it('keeps the current page for ordinary product rows', () => {
    expect(pageForRow('Pandesal', 3)).toBe(3);
  });

  it('reads the page number rather than counting headers', () => {
    // Sheets have been observed to skip a page block entirely; trusting the
    // printed number keeps the type mapping correct when that happens.
    expect(pageForRow('PAGE 4', 2)).toBe(4);
  });

  it('tolerates surrounding whitespace', () => {
    expect(pageForRow('  PAGE 3 ', 1)).toBe(3);
  });

  it('ignores a label that merely starts with the word page', () => {
    expect(pageForRow('Pageant Cake', 1)).toBe(1);
  });
});

describe('typeForPage', () => {
  // Verified against the seeded catalog: every product under each page block
  // carries exactly this type (35 BREAD, 55 CAKE, 39 SPECIAL, 40 MISC).
  it.each([
    [1, 'BREAD'],
    [2, 'CAKE'],
    [3, 'SPECIAL'],
    [4, 'MISCELLANEOUS'],
  ])('maps page %i to %s', (page, expected) => {
    expect(typeForPage(page)).toBe(expected);
  });

  it('falls back to MISCELLANEOUS for a page beyond the known four', () => {
    // A fifth block would be a template the bakery has not used before. Guessing
    // BREAD would bury it among the staples; MISCELLANEOUS is the visible bucket.
    expect(typeForPage(7)).toBe('MISCELLANEOUS');
  });
});

describe('suggestedTypeFor', () => {
  it('types a main-section row by its page', () => {
    expect(suggestedTypeFor(2, 'main')).toBe('CAKE');
  });

  it('types a bote-section row as MISCELLANEOUS whatever page it sits on', () => {
    // Checked against the real workbook: the "Bote:" deposit block sits at the
    // end of page 3, so page alone types Litro/Kasalo/Cobra/Vitamilk/8oz as
    // SPECIAL. They are drink deposits and the catalog types all five
    // MISCELLANEOUS — the section has to win.
    expect(suggestedTypeFor(3, 'bote')).toBe('MISCELLANEOUS');
    expect(suggestedTypeFor(1, 'bote')).toBe('MISCELLANEOUS');
  });
});

describe('sectionForRow', () => {
  it('enters the bote section on a "Bote:" header', () => {
    expect(sectionForRow('Bote:', 'main')).toBe('bote');
  });

  it('stays in the bote section for following product rows', () => {
    expect(sectionForRow('Litro', 'bote')).toBe('bote');
  });

  it('leaves the bote section at the next PAGE header', () => {
    expect(sectionForRow('PAGE 4', 'bote')).toBe('main');
  });

  it('leaves the bote section at a TOTAL row', () => {
    expect(sectionForRow('TOTAL', 'bote')).toBe('main');
  });

  it('trims trailing whitespace from Bote: header', () => {
    expect(sectionForRow('Bote: ', 'main')).toBe('bote');
  });

  it('trims leading whitespace from PAGE header', () => {
    expect(sectionForRow(' PAGE 4', 'bote')).toBe('main');
  });
});

describe('isIgnoredLabel', () => {
  it.each(['Estante', 'Freezer', 'Ref', 'Trays', 'Board Stand', 'Thongs', 'Plancha', 'Wooden Estante/Cab', 'Ref-type Chiller', 'Cake Chiller (C2)'])(
    'ignores the equipment label %s',
    (label) => {
      expect(isIgnoredLabel(label)).toBe(true);
    },
  );

  it('does not ignore a real product', () => {
    expect(isIgnoredLabel('Pandesal')).toBe(false);
  });

  it('trims whitespace from both sides of equipment labels', () => {
    expect(isIgnoredLabel(' Estante ')).toBe(true);
  });
});
