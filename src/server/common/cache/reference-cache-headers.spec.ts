import { UnitConversionsController } from '../../unit-conversions/unit-conversions.controller';
import { ProductsController } from '../../products/products.controller';
import { RecipesController } from '../../recipes/recipes.controller';

// Nest stores @Header() metadata as an array of { name, value } under this key.
const HEADERS_METADATA = '__headers__';
const EXPECTED = [{ name: 'Cache-Control', value: 'private, max-age=60' }];

describe('reference endpoint cache headers', () => {
  it.each([
    ['UnitConversionsController', UnitConversionsController.prototype.findAll],
    ['ProductsController', ProductsController.prototype.findAll],
    ['RecipesController', RecipesController.prototype.findAll],
  ])('%s.findAll sets private max-age=60', (_name, handler) => {
    const meta = Reflect.getMetadata(HEADERS_METADATA, handler);
    expect(meta).toEqual(EXPECTED);
  });
});
