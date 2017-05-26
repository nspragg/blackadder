function createMessage(ctx) {
  const res = ctx.res;
  return `${ctx.getMethod()} ${ctx.getUrl()} ${res.statusCode} ${res.elapsedTime} ms`;
}

module.exports = (logger) => {
  const _logger = logger || console;

  return (ctx, next) => {
    return next().then(() => {
      _logger.info(createMessage(ctx));
    });
  };
};