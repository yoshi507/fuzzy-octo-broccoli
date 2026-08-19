const { getSession } = require('../services/sessions');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : null;
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({
      error: true,
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }
  req.sessionToken = token;
  req.session = session;
  req.user = session.user;
  next();
}

module.exports = { requireAuth };
