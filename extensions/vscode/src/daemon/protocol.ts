export interface DaemonMessage {}

export abstract class DaemonRequest implements DaemonMessage {
  abstract method: string;
  abstract id: string;
  abstract params: any;
}

export function isDeamonRequest(object: any): object is DaemonRequest {
  return "method" in object;
}

export interface DeamonResponse extends DaemonMessage {
  id: string;
  result: any;
  error: any;
}

export function isDeamonResponse(object: any): object is DeamonResponse {
  return "id" in object;
}

export interface DeamonEvent extends DaemonMessage {
  event: string;
  params: any;
}

export function isDeamonEvent(object: any): object is DeamonEvent {
  return "event" in object;
}
