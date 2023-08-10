import { CancellationToken, CodeLens, ProviderResult } from "vscode";
import { DebugCodeLensProvider } from ".";

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
      command: "dart-frog.start-dev-server",
      // TODO(alestiago): Pass the document URI to open server with route.
    };
    return codeLens;
  }
}
