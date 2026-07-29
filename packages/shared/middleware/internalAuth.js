// Checks the X-Internal-Api-Key header against INTERNAL_API_KEY for all
// /internal/* routes across all 4 services — see CLAUDE.md rule #7.

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function internalAuth(req, res, next) {
  const key = req.headers['x-internal-api-key'];
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected || !key || key !== expected) {
    return res.status(401).json({
      error: { message: 'Invalid or missing internal API key', code: 'UNAUTHENTICATED' },
    });
  }
  return next();
}

module.exports = internalAuth;
