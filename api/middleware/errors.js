function notFound(req, res) {
  res.status(404).json({
    error: true,
    code: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
}

function errorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: true,
      code: 'VALIDATION',
      message: 'Invalid JSON body'
    });
  }

  const status = err.status || 500;
  const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
  const isOpaqueServerError = status === 500;
  const message = isOpaqueServerError
    ? 'An internal error occurred'
    : (err.message || 'Request failed');

  if (isOpaqueServerError) {
    console.error('API error:', err?.code || err?.message || err);
  }

  const body = { error: true, code, message };
  if (err.errors) body.errors = err.errors;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
