import { FileDown, FolderOpen, Import, Layers, MapPinned, Moon, Save, Settings2, SquareDashedMousePointer, Sun } from "lucide-react";

type ToolbarProps = {
  busy: boolean;
  projectName: string;
  exportSelectionEnabled: boolean;
  theme: "day" | "night";
  onProjectNameChange(name: string): void;
  onImport(): void;
  onSave(): void;
  onOpen(): void;
  onGeoreference(): void;
  onGenerateTiles(): void;
  onToggleExportSelection(): void;
  onExportPdf(): void;
  onToggleTheme(): void;
  onCheckDependencies(): void;
};

export function Toolbar({
  busy,
  projectName,
  exportSelectionEnabled,
  theme,
  onProjectNameChange,
  onImport,
  onSave,
  onOpen,
  onGeoreference,
  onGenerateTiles,
  onToggleExportSelection,
  onExportPdf,
  onToggleTheme,
  onCheckDependencies,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <MapPinned size={22} aria-hidden="true" />
        <span>ZgegMapping</span>
      </div>

      <label className="project-name">
        <span>Projet</span>
        <input value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} />
      </label>

      <div className="toolbar-actions">
        <button type="button" onClick={onImport} disabled={busy} title="Importer une carte">
          <Import size={17} aria-hidden="true" />
          Importer une carte
        </button>
        <button type="button" onClick={onGeoreference} disabled={busy} title="Georeferencer la carte">
          <MapPinned size={17} aria-hidden="true" />
          Georeferencer la carte
        </button>
        <button type="button" onClick={onGenerateTiles} disabled={busy} title="Generer les tuiles">
          <Layers size={17} aria-hidden="true" />
          Generer les tuiles
        </button>
        <button
          type="button"
          className={exportSelectionEnabled ? "active" : ""}
          onClick={onToggleExportSelection}
          disabled={busy}
          title="Selectionner la zone a exporter"
        >
          <SquareDashedMousePointer size={17} aria-hidden="true" />
          Zone PDF
        </button>
        <button type="button" onClick={onExportPdf} disabled={busy} title="Preview et export PDF detaille">
          <FileDown size={17} aria-hidden="true" />
          Exporter PDF
        </button>
        <button type="button" onClick={onOpen} disabled={busy} title="Ouvrir un projet">
          <FolderOpen size={17} aria-hidden="true" />
          Ouvrir
        </button>
        <button type="button" onClick={onSave} disabled={busy} title="Sauvegarder le projet">
          <Save size={17} aria-hidden="true" />
          Sauvegarder
        </button>
        <button type="button" onClick={onToggleTheme} disabled={busy} title={theme === "day" ? "Mode nuit" : "Mode jour"}>
          {theme === "day" ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
          {theme === "day" ? "Nuit" : "Jour"}
        </button>
        <button type="button" className="icon-button" onClick={onCheckDependencies} disabled={busy} title="Verifier les dependances">
          <Settings2 size={18} aria-label="Verifier les dependances" />
        </button>
      </div>
    </header>
  );
}
