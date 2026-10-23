// Runs first before dev and build: the guide and font scripts load TypeScript files directly,
// which Node.js can do only from 22.18 on. An older Node.js otherwise stops with a puzzling
// ERR_UNKNOWN_FILE_EXTENSION from deep inside a build step; this says what to do instead.
// Kept free of anything newer than plain JavaScript, so that it runs on the old versions it warns about.
const MINIMUM = [22, 18];

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < MINIMUM[0] || (major === MINIMUM[0] && minor < MINIMUM[1])) {
  console.error(
    `layerling needs Node.js ${MINIMUM.join(".")} or newer; this is ${process.version}. ` +
      "Install the current LTS from https://nodejs.org (or update it with your version manager), then run the command again.",
  );
  process.exit(1);
}
