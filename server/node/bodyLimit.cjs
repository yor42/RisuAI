// The largest request body, in bytes, the server's three body parsers (json,
// raw and text) accept. The client's boot archive pass holds its own copy of
// this number in src/ts/storage/bootArchiveHost.ts, and a test pins the two
// equal, so changing one without the other fails that test.
const NODE_BODY_LIMIT_BYTES = 104857600; // 100 MiB, what express's '100mb' means

module.exports = { NODE_BODY_LIMIT_BYTES };
