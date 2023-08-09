import { DaemonRequest, DeamonEvent, isDeamonEvent } from "../protocol";

const domainName = "daemon";

export enum DaemonMessageName {
  requestVersion = `${domainName}.requestVersion`,
  kill = `${domainName}.kill`,
  ready = `${domainName}.ready`,
}

export class RequestVersionDaemonRequest extends DaemonRequest {
  constructor(id: string) {
    super();
    this.id = id;
  }

  public readonly method: string = DaemonMessageName.requestVersion;
  public readonly id: string;
  public readonly params: any = undefined;
}

export class KillDaemonRequest extends DaemonRequest {
  constructor(id: string) {
    super();
    this.id = id;
  }

  public readonly method: string = DaemonMessageName.kill;
  public readonly id: string;
  public readonly params: any = undefined;
}

export interface ReadyDeamonEvent extends DeamonEvent {
  event: DaemonMessageName.ready;
  params: {
    version: string;
    processId: number;
  };
}

export function isReadyDeamonEvent(object: any): object is DeamonEvent {
  return (
    isDeamonEvent(object) &&
    object.event === DaemonMessageName.ready &&
    typeof object.params.version === "string" &&
    typeof object.params.processId === "number"
  );
}
