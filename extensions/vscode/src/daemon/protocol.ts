export abstract class DaemonMessage {}

export abstract class DaemonRequest extends DaemonMessage {
  abstract method: string;
  abstract id: string;
  abstract params: Object | undefined;
}

export abstract class DaemonResponse extends DaemonMessage {
  abstract id: string;
  abstract result: Object | undefined;
  abstract error: Object | undefined;
}

export abstract class DaemonEvent extends DaemonMessage {
  abstract event: string;
  abstract domain: string;
  abstract params: Object | undefined;
}
