import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import {
  DaemonMessage,
  DaemonMessageName,
  DaemonRequest,
  isDeamonEvent,
} from ".";
import { IncrementalIdentifierGenerator } from "../utils";

/**
 * An error that is thrown when the Dart Frog Daemon has not yet been invoked
 * but a request is made to it.
 */
export class DartFrogDaemonWaiveError extends Error {
  constructor() {
    super("The Dart Frog Daemon is yet to be invoked.");
  }
}

/**
 * An error that is thrown when the Dart Frog Daemon is invoked but is not yet
 * ready to accept requests.
 */
export class DartFrogDaemonReadyError extends Error {
  constructor() {
    super("The Dart Frog Daemon is not yet ready to accept requests.");
  }
}

/**
 * The Dart Frog Daemon is a long-running process that is responsible for
 * managing a single or multiple Dart Frog projects simultaneously.
 */
export class DartFrogDaemon {
  private static _instance: DartFrogDaemon;

  /**
   * A singleton instance of the Dart Frog Daemon.
   *
   * A Dart Frog Deamon can manage multiple Dart Frog projects simultaneously.
   */
  public static get instance() {
    return this._instance || (this._instance = new this());
  }

  // TODO(alestiago): Consider moving this to a separate file.
  private static decodeMessages(data: Buffer): DaemonMessage[] {
    const stringData = data.toString();
    const messages = stringData.split("\n").filter((s) => s.trim().length > 0);
    const parsedMessages = messages.map((message) => JSON.parse(message));

    let deamonMessages: DaemonMessage[] = [];
    for (const parsedMessage of parsedMessages) {
      for (const message of parsedMessage) {
        deamonMessages.push(message as DaemonMessage);
      }
    }

    return deamonMessages;
  }

  /**
   * The process that is running the Dart Frog Daemon.
   *
   * Undefined until the Dart Frog Daemon is {@link invoke}d.
   */
  private process: ChildProcessWithoutNullStreams | undefined;

  private _isReady: boolean = false;

  /**
   * Whether the Dart Frog Daemon is ready to accept requests.
   *
   * The Dart Frog Daemon is ready to accept requests when it has emmitted
   * the "ready" event after being {@link invoke}d.
   *
   * @see {@link invoke} to invoke the Dart Frog Daemon.
   */
  public get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Generates unique identifiers for requests.
   *
   * Should not be used as a request counter, since it is not guaranteed to
   * be called the same number of times as the number of requests sent.
   */
  public readonly identifierGenerator: IncrementalIdentifierGenerator =
    new IncrementalIdentifierGenerator();

  /**
   * Invokes the Dart Frog Daemon.
   *
   * If the Dart Frog Daemon is already running, this method will immediately
   * return.
   *
   * After invoking the Dart Frog Daemon, it will be ready to accept requests.
   *
   * @param workingDirectory
   * @returns True if the Dart Frog Daemon was successfully invoked.
   */
  public async invoke(workingDirectory: string): Promise<void> {
    if (this.isReady) {
      // TODO(alestiago): Check if can return without promise.
      return Promise.resolve();
    }

    this.process = spawn("dart_frog", ["daemon"], {
      cwd: workingDirectory,
    });

    let resolveReadyPromise: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReadyPromise = resolve;
    });

    const readyListener = (data: any) => {
      const messages = DartFrogDaemon.decodeMessages(data);
      for (const message of messages) {
        if (
          !this._isReady &&
          isDeamonEvent(message) &&
          message.event === DaemonMessageName.ready
        ) {
          this._isReady = true;
          resolveReadyPromise();
          this.process!.stdout.removeListener("data", readyListener);
        }
      }
    };
    this.process.stdout.addListener("data", readyListener);

    // TODO(alestiago): Consider adding a timeout limit.
    return readyPromise;
  }

  /**
   * Sends a request to the Dart Frog Daemon.
   *
   * If the Dart Frog Daemon is not ready to accept requests, this method
   * will do nothing.
   *
   * @param request The request to send to the Dart Frog Daemon.
   * @throws {DartFrogDaemonWaiveError} If the Dart Frog Daemon has not yet
   * been {@link invoke}d.
   * @throws {DartFrogDaemonReadyError} If the Dart Frog Daemon is not yet
   * ready to accept requests.
   *
   * @see {@link isReady} to check if the Dart Frog Daemon is ready to accept
   * requests.
   */
  public send(request: DaemonRequest): void {
    if (!this.process) {
      throw new DartFrogDaemonWaiveError();
    }
    if (!this.isReady) {
      throw new DartFrogDaemonReadyError();
    }

    // TODO(alestiago): Handle daemon connection lost.
    const encodedRequest = `${JSON.stringify([request])}\n`;
    this.process!.stdin.write(encodedRequest);
  }

  /**
   * Adds a listener to listen to Dart Frog Daemon messages.
   *
   * The messages are decoded from the raw data that is sent by the Dart Frog
   * Daemon via stdout.
   *
   * @param callback The callback that will be invoked when the Dart Frog Daemon
   * sends a message.
   * @returns The raw data listener that was added to the Dart Frog Daemon. This
   * can be used to remove the listener later via
   * {@link removeListener}.
   * @throws {DartFrogDaemonWaiveError} If the Dart Frog Daemon has not yet
   * been {@link invoke}d.
   * @see {@link removeListener} to remove a listener from the Dart Frog Daemon.
   */
  public addListener(
    callback: (message: DaemonMessage) => void
  ): (data: any) => void {
    if (!this.process) {
      throw new DartFrogDaemonWaiveError();
    }

    const decodingListener = (data: any) => {
      const messages = DartFrogDaemon.decodeMessages(data);
      for (const message of messages) {
        callback(message);
      }
    };

    this.process!.stdout.addListener("data", decodingListener);
    return decodingListener;
  }

  /**
   * Removes a registered listener from the Dart Frog Daemon process.
   *
   * @param listener The raw listener to remove from the Dart Frog Daemon,
   * should be the return value of {@link addListener}.
   * @see {@link addListener} to add a listener to the Dart Frog Daemon.
   */
  public removeListener(listener: (data: any) => void): void {
    this.process!.stdout.removeListener("data", listener);
  }

  // TODO(alestiago): Consider adding a method to ping the Dart Frog Daemon and
  // check if it is still alive.
}
