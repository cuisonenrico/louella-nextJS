import { sectionForRow, isIgnoredLabel } from './sheet-sections';

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
});

describe('isIgnoredLabel', () => {
  it.each(['Estante', 'Freezer', 'Ref', 'Trays', 'Wooden Estante/Cab', 'Cake Chiller (C2)'])(
    'ignores the equipment label %s',
    (label) => {
      expect(isIgnoredLabel(label)).toBe(true);
    },
  );

  it('does not ignore a real product', () => {
    expect(isIgnoredLabel('Pandesal')).toBe(false);
  });
});
