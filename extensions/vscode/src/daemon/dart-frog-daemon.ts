import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import {
  DaemonMessage,
  DaemonMessageName,
  DaemonRequest,
  DartFrogApplicationRegistry,
  DeamonEvent,
  DeamonResponse,
  isDeamonEvent,
  isDeamonResponse,
} from ".";
import { IncrementalIdentifierGenerator } from "../utils";
import { EventEmitter } from "events";

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

// TODO(alestiago): Consider using the events name, request name and request id
// instead.
export enum DartFrogDaemonEventEmitterTypes {
  request = "request",
  response = "response",
  event = "event",
}

// TODO(alestiago): Consider subclassing EventEmitter.
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

  private _deamonMessagesEventEmitter = new EventEmitter();

  // TODO(alestiago): Consider refactoring to allow filtering of messages by
  // their names.
  /**
   * An event emitter that emits events upon Dart Frog Daemon communication.
   *
   * Events:
   * - "request": When a request is sent to the Dart Frog Daemon, the
   * {@link DaemonRequest} is passed as an argument to the event handler.
   * - "response": When a response is received from the Dart Frog Daemon, the
   * {@link DeamonResponse} is passed as an argument to the event handler.
   * - "event": When an event is received from the Dart Frog Daemon, the
   * {@link DaemonMessage} is passed as an argument to the event handler.
   *
   * @see {@link DartFrogDaemonEventEmitterTypes} for the types of events that
   * are emitted.
   */
  public get deamonMessagesEventEmitter(): EventEmitter {
    return this._deamonMessagesEventEmitter;
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
  public readonly requestIdentifierGenerator: IncrementalIdentifierGenerator =
    new IncrementalIdentifierGenerator();

  /**
   * A registry of the Dart Frog applications that are currently running on
   * this Dart Frog Daemon.
   */
  public readonly applicationsRegistry: DartFrogApplicationRegistry =
    new DartFrogApplicationRegistry(this);

  /**
   * Invokes the Dart Frog Daemon.
   *
   * If the Dart Frog Daemon is already running, this method will immediately
   * return.
   *
   * After invoking the Dart Frog Daemon, it will be ready to accept requests.
   *
   * @param workingDirectory The working directory of the Dart Frog Daemon,
   * usually the root directory of the Dart Frog project.
   * @returns True if the Dart Frog Daemon was successfully invoked.
   */
  public async invoke(workingDirectory: string): Promise<void> {
    if (this.isReady) {
      // TODO(alestiago): Check if can return without promise.
      return Promise.resolve();
    }

    let resolveReadyPromise: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReadyPromise = resolve;
    });

    const readyEventListener = (message: DeamonEvent) => {
      if (!this._isReady && message.event === DaemonMessageName.ready) {
        this._isReady = true;
        resolveReadyPromise();
        this.deamonMessagesEventEmitter.off(
          DartFrogDaemonEventEmitterTypes.event,
          readyEventListener
        );
      }
    };
    this.deamonMessagesEventEmitter.on(
      DartFrogDaemonEventEmitterTypes.event,
      readyEventListener.bind(this)
    );

    this.process = spawn("dart_frog", ["daemon"], {
      cwd: workingDirectory,
    });
    this.process.stdout.on("data", this.stdoutDataListener.bind(this));

    // TODO(alestiago): Consider adding a timeout limit.
    return readyPromise;
  }

  /**
   * Decodes the stdout and emits events accordingly via the
   * {@link deamonMessagesEventEmitter}.
   *
   * @param data The data that was received from the stdout of the Dart Frog
   * Daemon.
   * @see {@link deamonMessagesEventEmitter} for listening to the events that
   * are emitted.
   */
  private stdoutDataListener(data: Buffer): void {
    const deamonMessages = DartFrogDaemon.decodeMessages(data);
    for (const message of deamonMessages) {
      if (isDeamonEvent(message)) {
        this._deamonMessagesEventEmitter.emit(
          DartFrogDaemonEventEmitterTypes.event,
          message
        );
      } else if (isDeamonResponse(message)) {
        this._deamonMessagesEventEmitter.emit(
          DartFrogDaemonEventEmitterTypes.response,
          message
        );
      }
    }
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
   * @returns A promise that resolves to the response from the Dart Frog
   * Daemon to the request.
   *
   * @see {@link isReady} to check if the Dart Frog Daemon is ready to accept
   * requests.
   */
  public send(request: DaemonRequest): Promise<DeamonResponse> {
    if (!this.process) {
      throw new DartFrogDaemonWaiveError();
    } else if (!this.isReady) {
      throw new DartFrogDaemonReadyError();
    }

    let resolveResponsePromise: (response: DeamonResponse) => void;
    const responsePromise = new Promise<DeamonResponse>((resolve) => {
      resolveResponsePromise = resolve;
    });

    const responseListener = (message: DeamonResponse) => {
      if (message.id === request.id && message.result) {
        resolveResponsePromise(message);
        this.deamonMessagesEventEmitter.off(
          DartFrogDaemonEventEmitterTypes.response,
          responseListener
        );
      }
    };
    this.deamonMessagesEventEmitter.on(
      DartFrogDaemonEventEmitterTypes.response,
      responseListener.bind(this)
    );

    // TODO(alestiago): Handle daemon connection lost.
    const encodedRequest = `${JSON.stringify([request])}\n`;
    this.process!.stdin.write(encodedRequest);
    this._deamonMessagesEventEmitter.emit(
      DartFrogDaemonEventEmitterTypes.request,
      request
    );

    return responsePromise;
  }

  // TODO(alestiago): Consider adding a method to ping the Dart Frog Daemon and
  // check if it is still alive.

  // TODO(alestiago): Consider adding a method to kill the Dart Frog Daemon and
  // dispose of the process, event emitter, listeners, etc.
}
