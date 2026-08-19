/* Stand-in for the `server-only` package, for scripts.

   `server-only` exists to throw at build time if a server module is ever pulled
   into a browser bundle. Next resolves it during its own build; plain Node
   cannot, so any script that reaches into `lib/` — which is most of them —
   dies on the import before it runs a line.

   Empty on purpose. The guarantee it provides is a BUILD-time one, and a script
   run from a terminal is not a bundle. Substituting it here weakens nothing:
   `next build` still resolves the real package and still fails if a server
   module reaches the client.

   Used via `Module._resolveFilename` in the scripts that need it, rather than
   installed as a dependency, so nothing about the app's dependency tree changes
   to suit a reporting script. */
module.exports = {};
