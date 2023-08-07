import { Transform } from "node:stream";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { DaemonMessageName, DaemonRequest } from ".";

/**
 * The Dart Frog Daemon is a long-running process that is responsible for
 * managing a single or multiple Dart Frog projects simultaneously.
 */
export class DartFrogDaemon {
  private process: ChildProcessWithoutNullStreams;

  private _isReady: boolean = false;

  /**
   * Whether the Dart Frog Daemon is ready to accept requests.
   *
   * The Dart Frog Daemon is ready to accept requests when it has emmitted
   * the "ready" event.
   */
  public get isReady(): boolean {
    return this._isReady;
  }

  /**
   * The number of requests that have been sent to the Dart Frog Daemon.
   *
   * This is used to generate unique request IDs.
   */
  private requestCounter: bigint = 0n;

  constructor() {
    // TODO(alestiago): Consider adding logic to check if the Dart Frog CLI
    // is installed and if not, install it.
    this.process = spawn("dart", ["bin/main.dart"]);

    // TODO(alestiago): Evaluate if we need to explicitly set the encoding or
    // if we can just use the default encoding.
    this.process.stdout.setEncoding("utf8");
    const readyListener = this.process.stdout.on(
      "data",
      this.readyListener.bind(this)
    );
  }

  private readyListener(data: any): void {
    const event = JSON.parse(data)[0];
    if (!this.isReady && event.event === DaemonMessageName.ready) {
      this._isReady = true;
      this.process.stdout.removeListener("data", this.readyListener);
    }
  }

  /**
   * Generates a unique request ID.
   */
  public generateRequestId(): string {
    return (this.requestCounter++).toString();
  }

  /**
   * Sends a request to the Dart Frog Daemon.
   *
   * If the Dart Frog Daemon is not ready to accept requests, this method
   * will do nothing.
   *
   * @param request The request to send to the Dart Frog Daemon.
   */
  public send(request: DaemonRequest): void {
    if (!this.isReady) {
      return;
    }

    this.process.stdin.write(`${JSON.stringify([request])}\n`);
  }

  /**
   * Listens to messages from a specific request.
   *
   * This method returns a Transform stream that filters out messages that
   * do not match the request ID.
   *
   * Make sure to call `end()` on the returned stream when you are done
   * listening to the request, since the Transform will not end on its own.
   *
   * @param id The ID of the request to listen to.
   * @returns A Transform stream that filters out messages that do not match
   * the request ID and parses the JSON.
   */
  public addListener(id: string): Transform {
    return this.process.stdout.pipe(
      new Transform({
        objectMode: true,
        encoding: "utf8",
        transform: (chunk, _, callback) => {
          // TODO(alestiago): Double check that messages usually have a single
          // element in the array.
          const message = JSON.parse(chunk.toString())[0];
          if (message.id === id) {
            callback(null, message);
          }
        },
      })
    );
  }
}
