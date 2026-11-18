// How the Board reader words a caught error inside the messages it puts on the Board.

/** The error's message, or the thrown value itself as text when it isn't an Error. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
