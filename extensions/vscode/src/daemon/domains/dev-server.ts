import { DaemonRequest } from "..";

const domainName = "dev_server";

export enum DevServerMessageName {
  start = `${domainName}.start`,
  reload = `${domainName}.reload`,
  stop = `${domainName}.stop`,
  applicationStarting = `${domainName}.applicationStarting`,
  applicationExit = `${domainName}.applicationExit`,
}

export class Start extends DaemonRequest {
  constructor(
    id: string,
    workingDirectory: String,
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
  public readonly params: Object;
}

export class Reload extends DaemonRequest {
  constructor(id: string, applicationId: string) {
    super();
    this.id = id;
    this.params = {
      applicationId: applicationId,
    };
  }

  public readonly method: string = DevServerMessageName.reload;
  public readonly id: string;
  public readonly params: Object;
}

export class Stop extends DaemonRequest {
  constructor(id: string, applicationId: string) {
    super();
    this.id = id;
    this.params = {
      applicationId: applicationId,
    };
  }

  public readonly method: string = DevServerMessageName.stop;
  public readonly id: string;
  public readonly params: Object;
}
