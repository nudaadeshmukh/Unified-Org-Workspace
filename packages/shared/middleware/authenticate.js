// Verifies the RS256 access token and attaches req.user.

const { verify } = require('../jwt');

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: { message: 'Missing or invalid Authorization header', code: 'UNAUTHENTICATED' },
    });
  }

  try {
    req.user = verify(token);
    return next();
  } catch (err) {
    return res.status(401).json({
      error: { message: 'Invalid or expired access token', code: 'UNAUTHENTICATED' },
    });
  }
}

module.exports = authenticate;
