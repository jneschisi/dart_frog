import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import {
  DaemonMessage,
  DaemonMessageName,
  DaemonRequest,
  DartFrogApplication,
  DeamonEvent,
  DeamonResponse,
  DevServerMessageName,
  Start,
  Stop,
  isDeamonEvent,
  isDeamonResponse,
} from ".";
import { IncrementalIdentifierGenerator } from "../utils";
import { EventEmitter } from "events";

/**
 * The prefix of the message that is sent by the Dart Frog Daemon when the Dart
 * VM service is listening.
 *
 * @example
 * "The Dart VM service is listening on http://127.0.0.1:8181/fQBcSu3OOc8=/"
 */
const vmServiceUriMessagePrefix = "The Dart VM service is listening on ";

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

export enum DartFrogDaemonEventEmitterTypes {
  request = "request",
  response = "response",
  event = "event",
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

  // TODO(alestiago): Consider using a new class to manage the running
  // applications.
  private _runningApplications: DartFrogApplication[] = [];

  private _deamonMessagesEventEmitter = new EventEmitter();

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
   * The Dart Frog applications that are currently running.
   */
  public get applications(): DartFrogApplication[] {
    // TODO(alestiago): Make sure it is immutable.
    return this._runningApplications;
  }

  private _runningApplicationsEventEmitter = new EventEmitter();

  /**
   * An event emitter that emits events when the list of running applications,
   * or one of its properties, changes.
   *
   * Events:
   * - "add": When a new application is added to the list of running
   *  applications.
   * - "remove": When an application is removed from the list of running
   * applications.
   * - "change:<property>": When an application's <property> changes.
   */
  public get runningApplicationsEventEmitter(): EventEmitter {
    return this._runningApplicationsEventEmitter;
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

    const responseListener = this.addListener((message) => {
      if (
        isDeamonResponse(message) &&
        message.id === request.id &&
        message.result
      ) {
        resolveResponsePromise(message);
        // TODO(alestiago): Check if the listener is being removed.
        this.removeListener(responseListener);
      }
    });

    if (request instanceof Start) {
      this.registerRunningDartFrogApplication(request, responsePromise);
    } else if (request instanceof Stop) {
      this.deregisterRunningDartFrogApplication(request, responsePromise);
    }

    // TODO(alestiago): Handle daemon connection lost.
    const encodedRequest = `${JSON.stringify([request])}\n`;
    this.process!.stdin.write(encodedRequest);
    this._deamonMessagesEventEmitter.emit(
      DartFrogDaemonEventEmitterTypes.request,
      request
    );

    return responsePromise;
  }

  private async registerRunningDartFrogApplication(
    request: Start,
    response: Promise<DeamonResponse>
  ) {
    const dartFrogApplication = new DartFrogApplication(
      request.params.workingDirectory,
      request.params.port,
      request.params.dartVmServicePort
    );

    // TODO(alestiago): Check if .then chain will be required.
    await response.then((response) => {
      if (response.result.applicationId) {
        dartFrogApplication.identifier = response.result.applicationId;
        this._runningApplications.push(dartFrogApplication);
        this._runningApplicationsEventEmitter.emit("add", dartFrogApplication);
      }
    });

    // TODO(alestiago): Consider if it is worth to refactor to its own method.
    const vmServiceUriListener = this.addListener((message) => {
      // TODO(alestiago): Consider adding a timeout limit.
      if (
        isDeamonEvent(message) &&
        message.event === DevServerMessageName.loggerInfo &&
        message.params.requestId === request.id
      ) {
        if (!message.params.message) {
          return;
        }

        const content = message.params.message;
        if (content.startsWith(vmServiceUriMessagePrefix)) {
          const vmServiceUri = content.substring(
            vmServiceUriMessagePrefix.length
          );
          dartFrogApplication.vmServiceUri = vmServiceUri;
          this._runningApplicationsEventEmitter.emit(
            "change:vmServiceUri",
            dartFrogApplication
          );
          // TODO(alestiago): Check if the listener is actually removed.
          this.removeListener(vmServiceUriListener);
        }
      }
    });
  }

  private async deregisterRunningDartFrogApplication(
    request: Stop,
    response: Promise<DeamonResponse>
  ) {
    // TODO(alestiago): Check if .then chain will be required.
    response.then((response) => {
      // TODO(alestiago): Check what exit code is successful.
      if (response.result.applicationId && response.result.exitCode === 1) {
        const dartFrogApplication = this._runningApplications.find(
          (application) =>
            application.identifier === response.result.applicationId
        );
        if (dartFrogApplication) {
          this._runningApplications.splice(
            this._runningApplications.indexOf(dartFrogApplication),
            1
          );
          this._runningApplicationsEventEmitter.emit(
            "remove",
            dartFrogApplication
          );
        }
      }
    });
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

  // TODO(alestiago): Consider adding a method to kill the Dart Frog Daemon and
  // dispose of the process, event emitter, listeners, etc.
}
