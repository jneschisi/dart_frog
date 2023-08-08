import { Transform } from "node:stream";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import {
  DaemonMessage,
  DaemonMessageName,
  DaemonRequest,
  isDeamonEvent,
} from ".";
import { IncrementalIdentifierGenerator } from "../utils";

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

  private process: ChildProcessWithoutNullStreams | undefined;

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
   * Generates unique identifiers for requests.
   */
  public identifierGenerator: IncrementalIdentifierGenerator =
    new IncrementalIdentifierGenerator();

  /**
   * Invokes the Dart Frog Daemon.
   *
   * If the Dart Frog Daemon is already running, this method will immediately
   * return.
   *
   * @param workingDirectory
   * @returns True if the Dart Frog Daemon was successfully invoked.
   */
  public async invoke(workingDirectory: string): Promise<void> {
    if (this.isReady) {
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
        const foo = isDeamonEvent(message);
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

    return readyPromise;
  }

  public addListener(
    callback: (message: DaemonMessage) => void
  ): (data: any) => void {
    const decodingListener = (data: any) => {
      const messages = DartFrogDaemon.decodeMessages(data);
      for (const message of messages) {
        callback(message);
      }
    };

    this.process!.stdout.addListener("data", decodingListener);
    return decodingListener;
  }

  public removeListener(listener: (data: any) => void): void {
    this.process!.stdout.removeListener("data", listener);
  }

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
   * Sends a request to the Dart Frog Daemon.
   *
   * If the Dart Frog Daemon is not ready to accept requests, this method
   * will do nothing.
   *
   * @param request The request to send to the Dart Frog Daemon.
   */
  public send(request: DaemonRequest): void | Transform {
    // TODO(alestiago): Check if ready.
    if (!this.process) {
      return;
    }

    // TODO(alestiago): Handle daemon connection lost.
    const encodedRequest = `${JSON.stringify([request])}\n`;
    this.process.stdin.write(encodedRequest);
  }
}
