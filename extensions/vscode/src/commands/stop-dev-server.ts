import {
  window,
  QuickPickItem,
  QuickInputButton,
  QuickPickItemKind,
  ProgressOptions,
} from "vscode";
import {
  DartFrogApplication,
  DartFrogDaemon,
  StopDaemonRequest,
} from "../daemon";

export const stopDevServer = async (): Promise<void> => {
  const dartFrogDaemon = DartFrogDaemon.instance;
  const applications = dartFrogDaemon.applicationsRegistry.all;

  let application: DartFrogApplication;
  if (applications.length === 0) {
    showInformationNoRunningDevServer();
    return;
  } else if (applications.length === 1) {
    application = applications[0];
  } else {
    const selection = await showServerQuickPick(applications);
    if (!selection) {
      return;
    }
    application = selection;
  }

  const stop = new StopDaemonRequest(
    dartFrogDaemon.requestIdentifierGenerator.generate(),
    application.id!
  );
  const stopResponse = dartFrogDaemon.send(stop);

  const options: ProgressOptions = {
    location: 15,
    title: `Stopping server...`,
  };
  window.withProgress(options, async function () {
    return await stopResponse;
  });
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

async function showServerQuickPick(
  applications: DartFrogApplication[]
): Promise<DartFrogApplication | undefined> {
  const quickPick = window.createQuickPick();
  quickPick.placeholder = "Select a device to use";
  quickPick.busy = true;
  quickPick.ignoreFocusOut = true;

  quickPick.items = applications.map(
    (application) => new PickableDartFrogApplication(application)
  );
  quickPick.show();

  // TODO(alestiago): Handle cancellation and selection.
  return undefined;
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
