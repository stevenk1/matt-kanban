// For shell calls whose failure the user can't act on: log it and carry on.

export function logFailure(action: string, promise: Promise<unknown>): void {
  promise.catch((error: unknown) => console.error(`Couldn't ${action}:`, error));
}
