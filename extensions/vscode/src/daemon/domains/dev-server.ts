import { DaemonRequest, DeamonEvent, isDeamonEvent, isDeamonRequest } from "..";

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
    // TODO(alestiago): Check for string not undefined.
    object.params.applicationId !== undefined &&
    object.params.requestId !== undefined &&
    object.params.exitCode !== undefined
  );
}
