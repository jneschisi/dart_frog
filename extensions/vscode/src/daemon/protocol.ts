export interface DaemonMessage {}

export abstract class DaemonRequest implements DaemonMessage {
  abstract method: string;
  abstract id: string;
  abstract params: any;
}

export function isDeamonRequest(object: any): object is DaemonRequest {
  return (
    typeof object.id === "string" &&
    typeof object.method === "string" &&
    "params" in object
  );
}

export interface DeamonResponse extends DaemonMessage {
  id: string;
  result: any;
  error: any;
}

export function isDeamonResponse(object: any): object is DeamonResponse {
  return (
    typeof object.id === "string" && ("result" in object || "error" in object)
  );
}

export interface DeamonEvent extends DaemonMessage {
  event: string;
  params: any;
}

export function isDeamonEvent(object: any): object is DeamonEvent {
  return typeof object.event === "string" && "params" in object;
}
