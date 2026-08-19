function notFound(req, res) {
  res.status(404).json({
    error: true,
    code: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message =
    status >= 500
      ? 'An internal error occurred'
      : err.message || 'Request failed';

  if (status >= 500) {
    console.error('API error:', err?.code || err?.message || err);
  }

  const body = { error: true, code, message };
  if (err.errors) body.errors = err.errors;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
