import {
  window,
  QuickPickItem,
  QuickInputButton,
  QuickPickItemKind,
} from "vscode";
import { DartFrogApplication, DartFrogDaemon } from "../daemon";

export const stopDevServer = async (): Promise<void> => {
  const quickPick = window.createQuickPick();
  quickPick.placeholder = "Select a device to use";
  quickPick.busy = true;
  quickPick.ignoreFocusOut = true;

  const dartFrogDaemon = DartFrogDaemon.instance;
  // TODO(alestiago): Check if daemon is running.
  const dartFrogApplications = dartFrogDaemon.applicationsRegistry.all;
  quickPick.items = dartFrogApplications.map(
    (dartFrogApplication) =>
      new PickableDartFrogApplication(dartFrogApplication)
  );
  quickPick.show();
};

class PickableDartFrogApplication implements QuickPickItem {
  constructor(dartFrogApplication: DartFrogApplication) {
    this.label = `$(globe) ${dartFrogApplication.port.toString()}`;
    this.description = dartFrogApplication.id?.toString();
  }

  label: string;
  kind?: QuickPickItemKind | undefined;
  description?: string | undefined;
  detail?: string | undefined;
  picked?: boolean | undefined;
  alwaysShow?: boolean | undefined;
  buttons?: readonly QuickInputButton[] | undefined;
}
