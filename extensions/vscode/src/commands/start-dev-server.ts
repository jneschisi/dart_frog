import {
  window,
  extensions,
  ProgressOptions,
  workspace,
  commands,
  Uri,
  debug,
} from "vscode";
import { nearestDartFrogProject } from "../utils";
import {
  DartFrogApplication,
  DartFrogDaemon,
  StartDaemonRequest,
  StartDeamonResponse,
} from "../daemon";

export const startDevServer = async (): Promise<void> => {
  const dartExtension = extensions.getExtension("Dart-Code.dart-code");
  if (!dartExtension) {
    window.showErrorMessage(
      "Running this command requires the Dart extension."
    );
    return;
  }

  if (!dartExtension.isActive) {
    const options: ProgressOptions = {
      location: 15,
      title: `Activating Dart extension...`,
    };
    window.withProgress(options, async function () {
      await dartExtension.activate();
    });
  }

  const workingDirectoryPath = workspace.workspaceFolders?.[0].uri.fsPath;
  if (workingDirectoryPath === undefined) {
    return;
  }

  const dartFrogProjectPath = nearestDartFrogProject(workingDirectoryPath);
  if (dartFrogProjectPath === undefined) {
    return;
  }

  const dartFrogDaemon = DartFrogDaemon.instance;
  if (!dartFrogDaemon.isReady) {
    const options: ProgressOptions = {
      location: 15,
      title: `Starting daemon...`,
    };
    await window.withProgress(options, async function () {
      await dartFrogDaemon.invoke(dartFrogProjectPath);
    });
  }

  // TODO(alestiago): Prompt for port and dartVmServicePort.
  const port = 8391;
  const dartVmServicePort = port + 1;
  const startMessage = new StartDaemonRequest(
    dartFrogDaemon.requestIdentifierGenerator.generate(),
    dartFrogProjectPath,
    port,
    dartVmServicePort
  );

  const startResponse = (await dartFrogDaemon.send(
    startMessage
  )) as StartDeamonResponse;

  let application = dartFrogDaemon.applicationsRegistry.getById(
    startResponse.result.applicationId
  );
  if (!application) {
    let resolveApplicationAddedPromise: (
      application: DartFrogApplication
    ) => void;
    const applicationAddedPromise = new Promise<DartFrogApplication>(
      (resolve) => {
        resolveApplicationAddedPromise = resolve;
      }
    );
    const applicationAddedEventListener = (
      application: DartFrogApplication
    ) => {
      if (application.id !== startResponse.result.applicationId) {
        return;
      }
      resolveApplicationAddedPromise(application);
      dartFrogDaemon.applicationsRegistry.off(
        "add",
        applicationAddedEventListener
      );
    };
    dartFrogDaemon.applicationsRegistry.on(
      "add",
      applicationAddedEventListener.bind(this)
    );
    application = await applicationAddedPromise;
  }

  attachToDebugSession(application.vmServiceUri!);
  setTimeout(() => {
    commands.executeCommand("vscode.open", Uri.parse(application!.address!));
  }, 5000);

  debug.onDidTerminateDebugSession(() => {
    // TODO(alestiago): Stop the development server.
  });
};

function attachToDebugSession(vmServiceUri: string): void {
  const options: ProgressOptions = {
    location: 15,
    title: `Attaching to debug session...`,
  };
  window.withProgress(options, async function () {
    return await debug.startDebugging(undefined, {
      name: "Dart Frog: Development Server",
      request: "attach",
      type: "dart",
      vmServiceUri: vmServiceUri,
    });
  });
}
