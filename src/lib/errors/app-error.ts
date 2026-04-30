/**
 * 项目统一错误类型。
 *
 * 严禁直接 `throw new Error(...)`，必须用 AppError 携带 code。
 *
 * 错误码格式：{MODULE}_{TYPE}_{REASON}
 * 例：ANCHOR_NOT_FOUND, DINGTALK_SYNC_FAILED, AUTH_FORBIDDEN_SCOPE
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly context?: Record<string, unknown>;

  constructor(code: string, message: string, httpStatus = 400, context?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.context = context;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.context ? { context: this.context } : {}),
      },
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
