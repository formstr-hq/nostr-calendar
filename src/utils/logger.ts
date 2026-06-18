type LogMethod = (...args: unknown[]) => void;

interface Logger {
  log: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  debug: LogMethod;
  error: LogMethod;
}

const IS_PROD = import.meta.env.PROD;

const noop: LogMethod = () => {};

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

  const warnMethod = wrap(console.warn.bind(console));
  const errorMethod = wrap(console.error.bind(console));

  if (IS_PROD) {
    return {
      log: noop,
      info: noop,
      warn: warnMethod,
      debug: noop,
      error: errorMethod,
    };
  }

  return {
    log: wrap(console.log.bind(console)),
    info: wrap(console.info.bind(console)),
    warn: warnMethod,
    debug: wrap(console.debug.bind(console)),
    error: errorMethod,
  };
}

export function overrideConsole(): void {
  const logger = createLogger("CONSOLE");
  console.log = logger.log;
  console.info = logger.info;
  console.warn = logger.warn;
  console.debug = logger.debug;
  console.error = logger.error;
}
