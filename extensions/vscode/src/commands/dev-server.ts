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
  DartFrogDaemon,
  DevServerMessageName,
  Start,
  isDeamonEvent,
} from "../daemon";

// TODO(alestiago): Rename file to match with command name.
// TODO(alestiago): Consider renaming to startDevServer.
export const startDevelopmentServer = async (): Promise<void> => {
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
      title: `Starting Dart Frog daemon...`,
    };
    await window.withProgress(options, async function () {
      await dartFrogDaemon.invoke(dartFrogProjectPath);
    });
  }

  // TODO(alestiago): Prompt for port and dartVmServicePort.
  const port = 8373;
  const dartVmServicePort = port + 1;

  const vmServiceUriListener = dartFrogDaemon.addListener((message) => {
    if (
      isDeamonEvent(message) &&
      message.event === DevServerMessageName.loggerInfo
    ) {
      if (!message.params) {
        return;
      }

      const content = message.params.message;
      const vmServiceUriMessagePrefix = "The Dart VM service is listening on ";
      if (content.startsWith(vmServiceUriMessagePrefix)) {
        // TODO(alestiago): Provide a DevServerManager that stores the running
        // applications id, port, vmServiceUri, etc.
        const vmServiceUri = content.substring(
          vmServiceUriMessagePrefix.length
        );
        attachToDebugSession(vmServiceUri);
        // TODO(alestiago): Check if the listener is actually removed.
        dartFrogDaemon.removeListener(vmServiceUriListener);
      }
    }
  });

  const startProcessCompleteListener = dartFrogDaemon.addListener((message) => {
    if (
      isDeamonEvent(message) &&
      message.event === DevServerMessageName.progressComplete
    ) {
      // TODO(alestiago): Actually parse the URI instead of composing it.
      setTimeout(() => {
        commands.executeCommand(
          "vscode.open",
          Uri.parse(`http://localhost:${port}/`)
        );
      }, 5000);
      dartFrogDaemon.removeListener(startProcessCompleteListener);
    }
  });

  const startMessage = new Start(
    dartFrogDaemon.identifierGenerator.generate(),
    dartFrogProjectPath,
    port,
    dartVmServicePort
  );
  dartFrogDaemon.send(startMessage);

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

// TODO(alestiago): Refactor to have one command per file.
export const stopDevelopmentServer = async (): Promise<void> => {};
