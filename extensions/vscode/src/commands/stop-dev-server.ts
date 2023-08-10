import {
  window,
  QuickPickItem,
  QuickInputButton,
  QuickPickItemKind,
} from "vscode";
import { DartFrogApplication, DartFrogDaemon } from "../daemon";

export const stopDevServer = async (): Promise<void> => {
  // TODO(alestiago): Check if daemon is running.
  const dartFrogDaemon = DartFrogDaemon.instance;
  const dartFrogApplications = dartFrogDaemon.applicationsRegistry.all;

  if (dartFrogApplications.length === 0) {
    showInformationNoRunningDevServer();
    return;
  }

  const quickPick = window.createQuickPick();
  quickPick.placeholder = "Select a device to use";
  quickPick.busy = true;
  quickPick.ignoreFocusOut = true;

  quickPick.items = dartFrogApplications.map(
    (dartFrogApplication) =>
      new PickableDartFrogApplication(dartFrogApplication)
  );
  quickPick.show();
};

async function showInformationNoRunningDevServer(): Promise<void> {
  const selection = await window.showInformationMessage(
    "There are no running servers to stop.",
    "Start server",
    "Ignore"
  );
  switch (selection) {
    case "Start server":
      // TODO(alestiago): Hook up to start server command.
      break;
    case "Ignore":
      break;
  }
}

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
