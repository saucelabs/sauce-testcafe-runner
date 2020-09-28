const { getAbsolutePath } = require('../../../src/utils');

describe('.getAbsolutePath', function () {
  it('returns absolute path unmodified', function () {
    expect(getAbsolutePath('/absolute/path/to/asset/')).toEqual('/absolute/path/to/asset/');
  });
  it('translates relative path to absolute', function () {
    expect(getAbsolutePath('path/to/asset/')).toMatch(/\/path\/to\/asset\/$/);
  });
});