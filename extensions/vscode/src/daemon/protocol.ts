export abstract class DaemonMessage {}

export abstract class DaemonRequest extends DaemonMessage {
  abstract method: string;
  abstract id: string;
  abstract domain: string;
  abstract params: Map<string, any> | undefined;
}

export abstract class DaemonResponse extends DaemonMessage {
  abstract id: string;
  abstract result: Map<string, any> | undefined;
  abstract error: Map<string, any> | undefined;
}

export abstract class DaemonEvent extends DaemonMessage {
  abstract event: string;
  abstract domain: string;
  abstract params: Map<string, any> | undefined;
}
