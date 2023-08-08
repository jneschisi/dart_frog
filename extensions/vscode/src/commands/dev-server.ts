import {
  window,
  extensions,
  ProgressOptions,
  workspace,
  CodeLensProvider,
  CancellationToken,
  CodeLens,
  Event,
  ProviderResult,
  TextDocument,
  EventEmitter,
  Position,
  commands,
  Uri,
  debug,
} from "vscode";
import { nearestDartFrogProject } from "../utils";
import {
  DaemonMessageName,
  DartFrogDaemon,
  DevServerMessageName,
  Start,
  Stop,
  isDeamonEvent,
} from "../daemon";
import { spawn } from "node:child_process";

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

  // const stopDevelopmentServerTaskName = "Dart Frog: Stop Development Server";
  // const stopDevelopmentServerTaskProvider = {};
  // const stopDevelopmentServerTask = tasks.registerTaskProvider(
  //   stopDevelopmentServerTaskName,
  //   stopDevelopmentServerTaskProvider
  // );

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
    dartFrogDaemon.generateRequestId(),
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

export const stopDevelopmentServer = async (): Promise<void> => {};

/**
 * Shows a "Debug" code lens on the top of the route handlers, which allows
 * to start the development server.
 */
export class DebugCodeLensProvider implements CodeLensProvider {
  private codeLenses: CodeLens[] = [];
  private regex: RegExp = /Response\s*onRequest\(RequestContext .*?\)\s*{/g;

  private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
  public readonly onDidChangeCodeLenses: Event<void> =
    this._onDidChangeCodeLenses.event;

  constructor() {
    workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  _hasEnabledCodeLenses(): boolean {
    // TODO(alestiago): Rename "extension" to "dart-frog".
    return workspace.getConfiguration("extension").get("enableCodeLens", true);
  }

  provideCodeLenses(
    document: TextDocument,
    token: CancellationToken
  ): ProviderResult<CodeLens[]> {
    if (!this._hasEnabledCodeLenses()) {
      return undefined;
    }

    this.codeLenses = [];
    const regex = new RegExp(this.regex);
    const text = document.getText();
    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(
        position,
        new RegExp(this.regex)
      );
      if (range) {
        this.codeLenses.push(new CodeLens(range));
      }
    }
    return this.codeLenses;
  }

  resolveCodeLens?(
    codeLens: CodeLens,
    token: CancellationToken
  ): ProviderResult<CodeLens> {
    if (!this._hasEnabledCodeLenses()) {
      return undefined;
    }

    codeLens.command = {
      title: "Debug",
      tooltip: "Starts a development server",
      command: "extension.start-development-server",
      // TODO(alestiago): Pass the document URI to open server with route.
    };
    return codeLens;
  }
}

export class RunCodeLensProvider extends DebugCodeLensProvider {
  resolveCodeLens?(
    codeLens: CodeLens,
    token: CancellationToken
  ): ProviderResult<CodeLens> {
    if (!this._hasEnabledCodeLenses()) {
      return undefined;
    }

    codeLens.command = {
      title: "Run",
      tooltip: "Starts a development server",
      command: "extension.start-development-server",
      // TODO(alestiago): Pass the document URI to open server with route.
    };
    return codeLens;
  }
}
