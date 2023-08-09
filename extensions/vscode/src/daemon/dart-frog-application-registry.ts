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

  private _runningApplications: DartFrogApplication[] = [];

  /**
   * The Dart Frog applications that are currently running.
   */
  public get applications(): DartFrogApplication[] {
    // TODO(alestiago): Make sure it is immutable.
    return this._runningApplications;
  }

  // TODO(alestiago): Consider using Observable?
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
   */
  public get runningApplicationsEventEmitter(): EventEmitter {
    return this._runningApplicationsEventEmitter;
  }

  private dartFrogDaemon: DartFrogDaemon;

  private async startRequestListener(request: StartDaemonRequest) {
    if (!isStartDaemonRequest(request)) {
      return;
    }

    const application = new DartFrogApplication(
      request.params.workingDirectory,
      request.params.port,
      request.params.dartVmServicePort
    );

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
