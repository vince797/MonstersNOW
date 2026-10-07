# Storybook cover series

`scripts/build-catalog-covers.js` is the single source of truth for the seven
public catalog covers. It places the exact transparent MonstersNow logo at the
same scale and position on every logo-free cover source.

## Lulu front-cover preparation

- Trim size: 8.5 x 8.5 in.
- Front-cover canvas with bleed: 8.75 x 8.75 in, exported at 2625 x 2625 px.
- Critical logo and title content is kept inside the conservative hardcover
  casewrap safety boundary: 0.75 in inside trim, plus the outer 0.125 in bleed.
- Background art continues through the bleed edge.
- The `lulu-fronts` files are front-panel candidates, not uploadable cover PDFs.

Lulu still requires a custom, single-page integrated PDF containing back cover,
spine, and front cover. Its exact width depends on the binding, paper, and final
interior page count. Build that spread only after retrieving Lulu's custom cover
dimensions/template for the exact product and final interior.

Run:

```sh
node scripts/build-catalog-covers.js
```
