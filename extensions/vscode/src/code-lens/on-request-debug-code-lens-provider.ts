import {
  CancellationToken,
  CodeLens,
  CodeLensProvider,
  EventEmitter,
  Event,
  Position,
  ProviderResult,
  TextDocument,
  workspace,
} from "vscode";

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
      command: "dart-frog.start-development-server",
      // TODO(alestiago): Pass the document URI to open server with route.
    };
    return codeLens;
  }
}
