// Next.js bundles CSS side-effect imports (`import "./globals.css"`), but ships
// no ambient declaration for them, so TS 6's TS2882 side-effect-import check
// flags them. The vite app gets the equivalent from `vite/client`.
declare module "*.css";
