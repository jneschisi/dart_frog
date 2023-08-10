import {
  DartFrogApplication,
  DartFrogDaemon,
  DartFrogDaemonEventEmitterTypes,
  DeamonEvent,
  StartDaemonRequest,
  isApplicationExitDeamonEvent,
  isApplicationStartingDeamonEvent,
  isLoggerInfoDeamonEvent,
  isProgressCompleteDeamonEvent,
  isStartDaemonRequest,
} from ".";
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
 * The Dart Frog applications that are currently running and managed by a Dart
 * Frog Daemon.
 */
export class DartFrogApplicationRegistry {
  constructor(dartFrogDaemon: DartFrogDaemon) {
    this.dartFrogDaemon = dartFrogDaemon;

    this.dartFrogDaemon.on(
      DartFrogDaemonEventEmitterTypes.request,
      this.startRequestListener.bind(this)
    );
    this.dartFrogDaemon.on(
      DartFrogDaemonEventEmitterTypes.event,
      this.applicationExitEventListener.bind(this)
    );
  }

  private dartFrogDaemon: DartFrogDaemon;

  private _runningApplications: DartFrogApplication[] = [];

  private _runningApplicationsEventEmitter = new EventEmitter();

  /**
   * Retrieves all the Dart Frog applications that are currently
   * registered with this Dart Frog Daemon.
   */
  public get all(): DartFrogApplication[] {
    // TODO(alestiago): Make sure it is immutable.
    return this._runningApplications;
  }

  /**
   * Retrieves the Dart Frog application that is currently registered with this
   * Dart Frog Daemon and has the given identifier.
   *
   * @param id The application identifier assigned by the Dart Frog Daemon.
   * @returns The Dart Frog application that is currently registered with this
   * Dart Frog Daemon and has the given identifier, or undefined if no such
   * application exists.
   */
  public getById(id: string): DartFrogApplication | undefined {
    return this.all.find((application) => {
      return application.id === id;
    });
  }

  /**
   * Starts listening to events related to this application registry.
   *
   * The possible types of events are:
   * - "add": When a new application is added to the list of running
   *  applications.
   * - "remove": When an application is removed from the list of running
   * applications.
   *
   * @returns A reference to this Dart Frog Daemon application registry,
   * so that calls can be chained.
   */
  public on(
    type: string,
    listener: (...args: any[]) => void
  ): DartFrogApplicationRegistry {
    this._runningApplicationsEventEmitter.on(type, listener);
    return this;
  }

  /**
   * Unsubscribes a listener from events related to this application registry.
   *
   * @param type The type of event to unsubscribe from.
   * @param listener The listener to unsubscribe.
   * @returns A reference to this Dart Frog Daemon application registry,
   * so that calls can be chained.
   */
  public off(
    type: string,
    listener: (...args: any[]) => void
  ): DartFrogApplicationRegistry {
    this._runningApplicationsEventEmitter.off(type, listener);
    return this;
  }

  private async startRequestListener(request: StartDaemonRequest) {
    if (!isStartDaemonRequest(request)) {
      return;
    }

    const application = new DartFrogApplication(
      request.params.workingDirectory,
      request.params.port,
      request.params.dartVmServicePort
    );

    // TODO(alestiago): Consider removing listeners if the application fails to
    // start.
    const applicationId = this.retrieveApplicationId(request.id).then(
      (applicationId) => {
        application.id = applicationId;
      }
    );
    const vmServiceUri = this.retrieveVmServiceUri(request.id).then(
      (vmServiceUri) => {
        application.vmServiceUri = vmServiceUri;
      }
    );
    await Promise.all([applicationId, vmServiceUri]);

    this.register(application);
  }

  private async retrieveApplicationId(requestId: string): Promise<string> {
    let resolveApplicationId: (vmServiceUri: string) => void;
    const applicationId = new Promise<string>((resolve) => {
      resolveApplicationId = resolve;
    });

    const applicationIdEventListener = (message: DeamonEvent) => {
      if (!isApplicationStartingDeamonEvent(message)) {
        return;
      } else if (message.params.requestId !== requestId) {
        return;
      }

      const applicationId = message.params.applicationId;
      resolveApplicationId(applicationId);
      this.dartFrogDaemon.off(
        DartFrogDaemonEventEmitterTypes.event,
        applicationIdEventListener
      );
    };
    this.dartFrogDaemon.on(
      DartFrogDaemonEventEmitterTypes.event,
      applicationIdEventListener.bind(this)
    );

    return applicationId;
  }

  // TODO(alestiago): Consider moving to DartFrogApplication?
  private async retrieveVmServiceUri(requestId: string): Promise<string> {
    // TODO(alestiago): Consider adding a timeout limit.
    let resolveVmServiceUriPromise: (vmServiceUri: string) => void;
    const vmServiceUriPromise = new Promise<string>((resolve) => {
      resolveVmServiceUriPromise = resolve;
    });

    const vmServiceUriEventListener = (message: DeamonEvent) => {
      if (!isLoggerInfoDeamonEvent(message)) {
        return;
      }

      if (message.params.requestId !== requestId) {
        return;
      }

      const content = message.params.message;
      if (content.startsWith(vmServiceUriMessagePrefix)) {
        const vmServiceUri = content.substring(
          vmServiceUriMessagePrefix.length
        );
        resolveVmServiceUriPromise(vmServiceUri);
        this.dartFrogDaemon.off(
          DartFrogDaemonEventEmitterTypes.event,
          vmServiceUriEventListener
        );
      }
    };
    this.dartFrogDaemon.on(
      DartFrogDaemonEventEmitterTypes.event,
      vmServiceUriEventListener.bind(this)
    );

    return vmServiceUriPromise;
  }

  // TODO(alestiago): Debug and check if after stop the application is still
  // running.
  private applicationExitEventListener(event: DeamonEvent) {
    if (!isApplicationExitDeamonEvent(event)) {
      return;
    }

    const applicationId = event.params.applicationId;
    const application = this._runningApplications.find(
      (app) => app.id === applicationId
    );
    if (!application) {
      return;
    }

    this.deregister(application);
  }

  private async register(application: DartFrogApplication) {
    const isAlreadyRegistered = this._runningApplications.find(
      (app) => app.id === application.id
    );
    if (isAlreadyRegistered) {
      return;
    }

    this._runningApplications.push(application);
    this._runningApplicationsEventEmitter.emit("add", application);
  }

  private async deregister(application: DartFrogApplication) {
    if (application) {
      this._runningApplications.splice(
        this._runningApplications.indexOf(application),
        1
      );
      this._runningApplicationsEventEmitter.emit("remove", application);
    }
  }
}
