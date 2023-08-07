const path = require("path");
import { spawn } from "child_process";
import {
  Uri,
  window,
  extensions,
  ProgressOptions,
  debug,
  tasks,
  Task,
  CustomExecution,
  workspace,
  commands,
  CodeLensProvider,
  CancellationToken,
  CodeLens,
  Event,
  ProviderResult,
  TextDocument,
  EventEmitter,
  DocumentSelector,
  Position,
} from "vscode";
import { nearestDartFrogProject } from "../utils";

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

  const dartFrogDaemon = spawn("dart_frog", ["daemon"], {
    cwd: dartFrogProjectPath,
  });
  // TODO(alestiago): Prompt for port and dartVmServicePort.
  const port = 8229;
  const dartVmServicePort = port + 1;
  // TODO(alestiago): Refactor deamon logic.
  dartFrogDaemon.stdout.on("data", (data: any) => {
    // TODO(alestiago): Listen for a dev_server.loggerInfo
    // Parse: The Dart VM service is listening on http://127.0.0.1:8182/5WJMWSTcLQg=/
    const event = JSON.parse(data)[0];
    if (event.event === "daemon.ready") {
      window.showInformationMessage(`Dart Frog daemon ready!`);
      const startMessage = {
        id: "1",
        method: "dev_server.start",
        params: {
          workingDirectory: dartFrogProjectPath,
          port: port,
          dartVmServicePort: dartVmServicePort,
        },
      };
      const message = JSON.stringify([startMessage]);
      dartFrogDaemon.stdin.write(`${message}\n`);
      window.showInformationMessage(`Starting server...`);
    }

    if (event.event === "dev_server.loggerInfo") {
      const message = event.params.message as String;
      if (message.startsWith("The Dart VM service is listening on ")) {
        const vmServiceUri = message.substring(
          "The Dart VM service is listening on ".length
        );
        window.showInformationMessage(`Starting development server...`);
        debug.startDebugging(undefined, {
          name: "Dart Frog: Development Server",
          request: "attach",
          type: "dart",
          vmServiceUri: vmServiceUri,
        });
      }
    }

    if (event.event === "dev_server.progressComplete") {
      // TODO(alestiago): Parse message instead of localhost
      setTimeout(() => {
        commands.executeCommand(
          "vscode.open",
          Uri.parse(`http://localhost:${port}/`)
        );
      }, 5000);
    }
  });
  dartFrogDaemon.stderr.on("data", (data: any) => {
    window.showErrorMessage(`stderr: ${data}`);
  });
  dartFrogDaemon.on("close", (code: any) => {
    window.showInformationMessage(`Dart Frog daemon exited with code ${code}`);
  });

  debug.onDidTerminateDebugSession(() => {
    dartFrogDaemon.kill();
  });
};

export const stopDevelopmentServer = async (): Promise<void> => {
  window.showInformationMessage("Stopping development server...");
};

/**
 * Shows a "Debug" code lens on the top of the route handlers, which allows
 * to start the development server.
 */
export class DebugCodeLensProvider implements CodeLensProvider {
  private codeLenses: CodeLens[] = [];
  private regex: RegExp = /(.+)/g;

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
