# Third-party notices

Chessroll's own code is licensed [MIT](./LICENSE). The following vendored assets carry their own license and are **not** covered by the MIT license above.

## cburnett chess piece set

- **Files:** `renderer/assets/pieces/cburnett/*.svg` (vendored unmodified), and the equivalent inline SVG markup embedded in `src/board/pieces.ts`.
- **Author:** [Colin M.L. Burnett](https://en.wikipedia.org/wiki/User:Cburnett).
- **License:** GNU General Public License, version 2 or later ([GPLv2+](https://www.gnu.org/licenses/gpl-2.0.txt)).
- **Source:** [lichess-org/lila](https://github.com/lichess-org/lila), `public/piece/cburnett/`, lichess.org's default piece set. License confirmed against lichess's own [COPYING.md](https://github.com/lichess-org/lila/blob/master/COPYING.md): `public/piece/cburnett | Colin M.L. Burnett | GPLv2+`.
- **Why:** used by explicit project choice to render immediately recognizable pieces rather than a bespoke set.

If you redistribute or modify these specific SVG files (or the equivalent markup in `pieces.ts`), GPLv2+ terms apply to them, independent of the rest of this repository's MIT license.
