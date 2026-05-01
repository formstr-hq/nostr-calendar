type LogMethod = (...args: unknown[]) => void;

interface Logger {
  log: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  debug: LogMethod;
  error: LogMethod;
}

function timestamp(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function createLogger(tag: string): Logger {
  const wrap =
    (method: LogMethod): LogMethod =>
    (...args) =>
      method(`${timestamp()} [${tag}]`, ...args);

  return {
    log: wrap(console.log.bind(console)),
    info: wrap(console.info.bind(console)),
    warn: wrap(console.warn.bind(console)),
    debug: wrap(console.debug.bind(console)),
    error: wrap(console.error.bind(console)),
  };
}
