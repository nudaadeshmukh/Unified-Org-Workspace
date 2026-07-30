// Locked storage mechanism (implementation_guide.md Phase 3): files land on
// this service's own local disk under uploads/, served back out via
// express.static — never an absolute URL, never S3/cloud storage in this
// build. Known limitation (carried to docs/known-limitations.md at Phase 9):
// Railway's container filesystem is ephemeral, so uploads won't survive a
// redeploy — acceptable for this assignment's timeline, not real production.
//
// Deliberately memoryStorage, not diskStorage: multer's middleware runs
// before the route handler, which runs before the ownsResource authorization
// check in attachment.service.js. diskStorage would write the file to disk
// unconditionally on every request that merely has the right *role name*
// (e.g. a wrong-org ORG_ADMIN), even when the subsequent 404 correctly
// blocks the Attachment DB row — leaving an orphaned, unreferenced file on
// disk. Buffering in memory and writing only after authorization passes
// (see attachment.service.js) avoids that entirely.

const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = { upload, UPLOAD_DIR };
