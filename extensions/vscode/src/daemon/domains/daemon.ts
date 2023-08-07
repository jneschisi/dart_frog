import { DaemonEvent, DaemonRequest } from "../protocol";

const domainName = "daemon";

export enum DaemonMessageName {
  requestVersion = `${domainName}.requestVersion`,
  kill = `${domainName}.kill`,
  ready = `${domainName}.ready`,
}

export class RequestVersion extends DaemonRequest {
  constructor(id: string) {
    super();
    this.id = id;
  }

  public readonly method: string = DaemonMessageName.requestVersion;
  public readonly id: string;
  public readonly domain: string = domainName;
  public readonly params: Map<string, any> | undefined = undefined;
}

export class Kill extends DaemonRequest {
  constructor(id: string) {
    super();
    this.id = id;
  }

  public readonly method: string = DaemonMessageName.kill;
  public readonly id: string;
  public readonly domain: string = domainName;
  public readonly params: Map<string, any> | undefined = undefined;
}
