export const BILLING_OPERATION_TIMEOUT_MS = 15_000;

export const NATIVE_BILLING_IDENTITY_TIMEOUT_MESSAGE =
  "Connecting to the app store timed out. Please try again.";

export const BILLING_REFRESH_TIMEOUT_MESSAGE =
  "Refreshing your subscription status timed out. Please try again.";

export const BILLING_OFFERINGS_TIMEOUT_MESSAGE =
  "Loading subscription options timed out. Please try again.";

export function withBillingTimeout<T>(
  operation: PromiseLike<T>,
  message: string,
  timeoutMs = BILLING_OPERATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    void Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}
