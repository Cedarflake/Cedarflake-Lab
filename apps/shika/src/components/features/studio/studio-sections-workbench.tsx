"use client";

import {useEffect, useMemo, useState} from "react";

import {Button} from "@/components/ui/button";
import type {
  IncidentSeverity,
  LifeSection,
  LifeSectionCategory,
  Visibility,
} from "@/types";

type StudioSectionRecord = LifeSection;

type SectionFormLabels = {
  visibility: string;
  severity: string;
  editorTitle: string;
  editorDescription: string;
  draftHint: string;
  reorderHint: string;
  dragHandleLabel: string;
  duplicateSuffix: string;
  fields: {
    name: string;
    description: string;
    category: string;
    defaultVisibility: string;
  };
  actions: {
    createDraft: string;
    reorderOn: string;
    reorderOff: string;
    duplicateCurrent: string;
    reset: string;
    markSaved: string;
    close: string;
  };
  status: {
    localDraft: string;
    sourceSection: string;
    lastSaved: string;
    neverSaved: string;
  };
  categories: Record<LifeSectionCategory, string>;
  visibilityOptions: Record<Visibility, string>;
  severityOptions: Record<IncidentSeverity, string>;
};

type SectionFormState = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: LifeSectionCategory;
  defaultVisibility: Visibility;
};

type DragOverState = {
  id: string;
  position: "before" | "after";
};

const EMPTY_SECTION_ID = "__new__";

export function StudioSectionsWorkbench({
  records,
  locale,
  currentSeverityBySectionId,
  labels,
}: {
  records: StudioSectionRecord[];
  locale: string;
  currentSeverityBySectionId: Record<string, IncidentSeverity>;
  labels: SectionFormLabels;
}) {
  const [orderedRecords, setOrderedRecords] = useState<StudioSectionRecord[]>(() => {
    return [...records].sort((left, right) => left.order - right.order);
  });
  const [selectedId, setSelectedId] = useState<string>(EMPTY_SECTION_ID);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DragOverState | null>(null);
  const [draft, setDraft] = useState<SectionFormState>(() => createEmptyDraft());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const selectedRecord = useMemo(
    () => orderedRecords.find((record) => record.id === selectedId) ?? null,
    [orderedRecords, selectedId],
  );

  const isDraftMode = selectedId === EMPTY_SECTION_ID || selectedRecord === null;

  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsEditorOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditorOpen]);

  function updateDraft<Key extends keyof SectionFormState>(key: Key, value: SectionFormState[Key]) {
    setDraft((current) => ({...current, [key]: value}));
  }

  function openEditorWithRecord(record: StudioSectionRecord) {
    if (isReorderMode) {
      return;
    }

    setSelectedId(record.id);
    setDraft(buildFormState(record));
    setIsEditorOpen(true);
  }

  function handleCreateDraft() {
    if (isReorderMode) {
      setIsReorderMode(false);
    }

    setSelectedId(EMPTY_SECTION_ID);
    setDraft(createEmptyDraft());
    setIsEditorOpen(true);
  }

  function handleToggleReorder() {
    setIsReorderMode((current) => {
      const next = !current;
      if (next) {
        setIsEditorOpen(false);
        setSelectedId(EMPTY_SECTION_ID);
      }
      return next;
    });
  }

  function reorderRecords(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return;
    }

    const dropPosition = dragOver?.id === targetId ? dragOver.position : "before";

    setOrderedRecords((current) => {
      const next = [...current];
      const sourceIndex = next.findIndex((record) => record.id === sourceId);
      const targetIndex = next.findIndex((record) => record.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const [moved] = next.splice(sourceIndex, 1);
      let insertIndex = targetIndex;

      if (sourceIndex < targetIndex) {
        insertIndex -= 1;
      }

      if (dropPosition === "after") {
        insertIndex += 1;
      }

      insertIndex = Math.max(0, Math.min(insertIndex, next.length));
      next.splice(insertIndex, 0, moved);

      return next.map((record, index) => ({...record, order: index + 1}));
    });
  }

  function handleDuplicateCurrent() {
    const source = selectedRecord ? buildFormState(selectedRecord) : draft;

    setSelectedId(EMPTY_SECTION_ID);
    setDraft({
      ...source,
      id: EMPTY_SECTION_ID,
      slug: createRandomSlug(),
      name: source.name ? `${source.name} ${labels.duplicateSuffix}` : "",
    });
  }

  function handleReset() {
    if (!selectedRecord) {
      setDraft(createEmptyDraft());
      return;
    }

    setDraft(buildFormState(selectedRecord));
  }

  function handleMarkSaved() {
    setLastSavedAt(new Date().toLocaleString(locale));
  }

  function handleCloseEditor() {
    setIsEditorOpen(false);
  }

  return (
    <section className="relative space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={handleCreateDraft}>
          {labels.actions.createDraft}
        </Button>
        <Button type="button" variant="ghost" onClick={handleToggleReorder}>
          {isReorderMode ? labels.actions.reorderOff : labels.actions.reorderOn}
        </Button>
      </div>

      {isReorderMode ? (
        <div className="surface-muted px-5 py-4 text-sm text-muted-foreground">
          {labels.reorderHint}
        </div>
      ) : null}

      <div className="grid gap-4">
        {orderedRecords.map((record) => (
          <div
            key={record.id}
            onDragOver={(event) => {
              if (!isReorderMode || !draggingId || draggingId === record.id) {
                return;
              }

              event.preventDefault();

              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              const isBefore = event.clientY - rect.top < rect.height / 2;
              setDragOver({id: record.id, position: isBefore ? "before" : "after"});
            }}
            onDrop={() => {
              if (!isReorderMode || !draggingId) {
                return;
              }

              reorderRecords(draggingId, record.id);
              setDraggingId(null);
              setDragOver(null);
            }}
            className={
              "relative surface-card w-full border border-transparent px-5 py-5 text-left transition" +
              (isReorderMode ? " hover:border-transparent" : " hover:border-border/70") +
              (isReorderMode ? " border-y-0" : "") +
              (draggingId === record.id ? " opacity-60" : "")
            }
          >
            {isReorderMode ? (
              <div
                className={
                  "absolute right-3 top-1/2 -translate-y-1/2 rounded-xl border border-border/70 bg-background px-2.5 py-2 text-xs text-muted-foreground" +
                  " cursor-grab active:cursor-grabbing"
                }
                draggable
                role="button"
                tabIndex={0}
                aria-label={labels.dragHandleLabel}
                title={labels.dragHandleLabel}
                onDragStart={() => {
                  setDraggingId(record.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOver(null);
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                  }
                }}
              >
                <span className="sr-only">{labels.dragHandleLabel}</span>
                <span aria-hidden>⋮⋮</span>
              </div>
            ) : null}

            {isReorderMode && dragOver?.id === record.id && draggingId && draggingId !== record.id ? (
              <div
                className={
                  "pointer-events-none absolute left-4 right-4 h-0.5 bg-primary" +
                  (dragOver.position === "before" ? " -top-2" : " -bottom-2")
                }
              />
            ) : null}

            <button
              type="button"
              onClick={() => openEditorWithRecord(record)}
              className={
                "w-full text-left" +
                (isReorderMode ? " cursor-default" : "") +
                (isReorderMode ? " pr-12" : "")
              }
            >
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">
                    {record.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {record.description}
                  </p>
                </div>
                <dl className="grid gap-3">
                  <CompactMeta
                    label={labels.visibility}
                    value={labels.visibilityOptions[record.defaultVisibility]}
                  />
                  <CompactMeta
                    label={labels.severity}
                    value={labels.severityOptions[currentSeverityBySectionId[record.id] ?? "normal"]}
                  />
                </dl>
              </div>
            </button>
          </div>
        ))}
      </div>

      {isEditorOpen ? (
        <div
          className="absolute inset-0 z-50 flex items-start justify-center bg-background px-4 py-6"
          onClick={handleCloseEditor}
          role="presentation"
        >
          <div
            className="surface-card w-full max-w-3xl overflow-y-auto px-6 py-7 shadow-none md:px-8 md:py-8"
            style={{maxHeight: "calc(100dvh - 8rem)"}}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex flex-col gap-4 border-b border-border/60 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    {labels.editorTitle}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">{labels.editorDescription}</p>
                </div>
                <Button type="button" variant="ghost" onClick={handleCloseEditor}>
                  {labels.actions.close}
                </Button>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">
                    {isDraftMode ? labels.status.localDraft : labels.status.sourceSection}
                  </span>
                </div>
                <div>{labels.draftHint}</div>
                <div>
                  {labels.status.lastSaved}: {lastSavedAt ?? labels.status.neverSaved}
                </div>
              </div>
            </div>

            <form className="grid gap-5 pt-6" onSubmit={(event) => event.preventDefault()}>
              <Field label={labels.fields.name}>
                <Input value={draft.name} onChange={(value) => updateDraft("name", value)} />
              </Field>

              <Field label={labels.fields.description}>
                <Textarea
                  value={draft.description}
                  onChange={(value) => updateDraft("description", value)}
                />
              </Field>

              <Field label={labels.fields.category}>
                <Select
                  value={draft.category}
                  onChange={(value) => updateDraft("category", value as LifeSectionCategory)}
                  options={Object.entries(labels.categories).map(([value, label]) => ({value, label}))}
                />
              </Field>

              <Field label={labels.fields.defaultVisibility}>
                <Select
                  value={draft.defaultVisibility}
                  onChange={(value) => updateDraft("defaultVisibility", value as Visibility)}
                  options={Object.entries(labels.visibilityOptions).map(([value, label]) => ({value, label}))}
                />
              </Field>

              <div className="flex flex-wrap gap-3 border-t border-border/60 pt-6">
                <Button type="button" onClick={handleMarkSaved}>
                  {labels.actions.markSaved}
                </Button>
                {!isDraftMode ? (
                  <Button type="button" variant="ghost" onClick={handleDuplicateCurrent}>
                    {labels.actions.duplicateCurrent}
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={handleReset}>
                  {labels.actions.reset}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function buildFormState(record: StudioSectionRecord): SectionFormState {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    category: record.category,
    defaultVisibility: record.defaultVisibility,
  };
}

function createEmptyDraft(): SectionFormState {
  return {
    id: EMPTY_SECTION_ID,
    slug: createRandomSlug(),
    name: "",
    description: "",
    category: "health",
    defaultVisibility: "public",
  };
}

function createRandomSlug() {
  return Math.random().toString(36).slice(2, 10);
}

function CompactMeta({label, value}: {label: string; value: string}) {
  return (
    <div className="surface-muted px-4 py-3">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary"
    />
  );
}

function Textarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={5}
      className="min-h-32 rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{value: string; label: string}>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
