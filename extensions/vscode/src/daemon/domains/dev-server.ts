import exp = require("constants");
import {
  DaemonRequest,
  DeamonEvent,
  DeamonResponse,
  isDeamonEvent,
  isDeamonRequest,
  isDeamonResponse,
} from "..";

const domainName = "dev_server";

export enum DevServerMessageName {
  start = `${domainName}.start`,
  reload = `${domainName}.reload`,
  stop = `${domainName}.stop`,
  applicationStarting = `${domainName}.applicationStarting`,
  applicationExit = `${domainName}.applicationExit`,
  loggerInfo = `${domainName}.loggerInfo`,
  loggerDetail = `${domainName}.loggerDetail`,
  progressStart = `${domainName}.progressStart`,
  progressComplete = `${domainName}.progressComplete`,
}

export class StartDaemonRequest extends DaemonRequest {
  constructor(
    id: string,
    workingDirectory: string,
    port: number,
    dartVmServicePort: number
  ) {
    super();
    this.id = id;
    this.params = {
      workingDirectory: workingDirectory,
      port: port,
      dartVmServicePort: dartVmServicePort,
    };
  }

  public readonly method: string = DevServerMessageName.start;
  public readonly id: string;
  public readonly params: {
    workingDirectory: string;
    port: number;
    dartVmServicePort: number;
  };
}

export function isStartDaemonRequest(
  object: any
): object is StartDaemonRequest {
  return (
    isDeamonRequest(object) &&
    object.method === DevServerMessageName.start &&
    object.params.workingDirectory !== undefined &&
    object.params.port !== undefined &&
    object.params.dartVmServicePort !== undefined
  );
}

export interface StartDeamonResponse extends DeamonResponse {
  result: {
    applicationId: string;
  };
}

export function isStartDeamonResponse(
  object: any
): object is StartDeamonResponse {
  return (
    isDeamonResponse(object) && typeof object.result.applicationId === "string"
  );
}

export class ReloadDaemonRequest extends DaemonRequest {
  constructor(id: string, applicationId: string) {
    super();
    this.id = id;
    this.params = {
      applicationId: applicationId,
    };
  }

  public readonly method: string = DevServerMessageName.reload;
  public readonly id: string;
  public readonly params: { applicationId: string };
}

export class StopDaemonRequest extends DaemonRequest {
  constructor(id: string, applicationId: string) {
    super();
    this.id = id;
    this.params = {
      applicationId: applicationId,
    };
  }

  public readonly method: string = DevServerMessageName.stop;
  public readonly id: string;
  public readonly params: { applicationId: string };
}

export interface ApplicationExitDaemonEvent extends DeamonEvent {
  params: { applicationId: string; requestId: string; exitCode: number };
}

export function isApplicationExitDeamonEvent(
  object: any
): object is ApplicationExitDaemonEvent {
  return (
    isDeamonEvent(object) &&
    object.event === DevServerMessageName.applicationExit &&
    typeof object.params.applicationId === "string" &&
    typeof object.params.requestId === "string" &&
    // TODO(alestiago): Check for the actual type of exitCode.
    typeof object.params.exitCode === "string"
  );
}

export interface LoggerInfoDeamonEvent extends DeamonEvent {
  params: {
    applicationId: string;
    requestId: string;
    workingDirectory: string;
    message: string;
  };
}

export function isLoggerInfoDeamonEvent(
  object: any
): object is LoggerInfoDeamonEvent {
  return (
    isDeamonEvent(object) &&
    object.event === DevServerMessageName.loggerInfo &&
    typeof object.params.applicationId === "string" &&
    typeof object.params.requestId === "string" &&
    typeof object.params.workingDirectory === "string" &&
    typeof object.params.message === "string"
  );
}

export interface ApplicationStartingDeamonEvent extends DeamonEvent {
  params: {
    applicationId: string;
    requestId: string;
  };
}

export function isApplicationStartingDeamonEvent(
  object: any
): object is ApplicationStartingDeamonEvent {
  return (
    isDeamonEvent(object) &&
    object.event === DevServerMessageName.applicationStarting &&
    typeof object.params.applicationId === "string" &&
    typeof object.params.requestId === "string"
  );
}

export interface ProgressCompleteDeamonEvent extends DeamonEvent {
  event: DevServerMessageName.progressComplete;
  params: {
    applicationId: string;
    requestId: string;
    workingDirectory: string;
    progressMessage: string;
    progressId: string;
  };
}

export function isProgressCompleteDeamonEvent(
  object: any
): object is ProgressCompleteDeamonEvent {
  return (
    isDeamonEvent(object) &&
    object.event === DevServerMessageName.progressComplete &&
    typeof object.params.applicationId === "string" &&
    typeof object.params.requestId === "string" &&
    typeof object.params.workingDirectory === "string" &&
    typeof object.params.progressMessage === "string" &&
    typeof object.params.progressId === "string"
  );
}
