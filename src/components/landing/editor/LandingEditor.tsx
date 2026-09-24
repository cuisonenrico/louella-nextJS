'use client';

/**
 * Settings → Landing Page. Edit every section of the public page in forms on
 * the left, see the result live on the right, save a draft, then publish.
 *
 * The preview renders `LandingRenderer` — the same component the public page
 * uses — over the unsaved draft, resolved client-side against the catalog the
 * draft endpoint returns. What you see here is what visitors will get.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
  AlertTriangle, ExternalLink, History, Loader2, Plus, RotateCcw, Save, Send,
} from 'lucide-react';
import { buildDefaultContent } from '@/lib/landing/defaults';
import { resolveWithCatalog } from '@/lib/landing/resolve';
import {
  SECTION_LABELS,
  landingContentSchema,
  type LandingContent,
  type LandingSection,
  type LandingSectionType,
} from '@/lib/landing/schema';
import { landingApi, type LandingDraftResponse, type LandingRevisionSummary } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { usePageHeader } from '@/components/layout/usePageHeader';
import QueryError from '@/components/QueryError';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogHeader,
  ResponsiveDialogTitle, ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import LandingRenderer from '../site/LandingRenderer';
import { RowControls, move, newId } from './fields';
import { BrandForm, SectionForm, type Catalog } from './section-forms';

const DRAFT_KEY = ['landing-draft'] as const;
const ADDABLE: LandingSectionType[] = ['hero', 'products', 'about', 'branches', 'cta', 'footer'];

/** A fresh section of `type`, from the default template with lists emptied. */
function blankSection(type: LandingSectionType): LandingSection {
  const template = buildDefaultContent().sections.find((s) => s.type === type)!;
  return { ...structuredClone(template), id: newId(type), anchor: '' };
}

function sectionSummary(section: LandingSection): string {
  if ('title' in section && section.title) return section.title;
  if (section.type === 'footer') return section.blurb;
  return '';
}

function firstIssue(content: LandingContent): string | null {
  const parsed = landingContentSchema.safeParse(content);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const [, index, ...rest] = issue.path;
  const where =
    issue.path[0] === 'sections' && typeof index === 'number'
      ? `${SECTION_LABELS[content.sections[index]?.type] ?? 'Section'} (${rest.join(' › ')})`
      : issue.path.join(' › ');
  return `${where}: ${issue.message}`;
}

function usePreview(content: LandingContent | null, catalog: Catalog | undefined) {
  return useMemo(() => {
    if (!content || !catalog) return null;
    const products = new Map(
      catalog.products.filter((p) => p.isActive).map((p) => [p.id, { id: p.id, name: p.name, price: p.price }]),
    );
    const branches = new Map(
      catalog.branches
        .filter((b) => b.isActive)
        .map((b) => [b.id, { id: b.id, name: b.name, address: b.address, phone: b.phone }]),
    );
    return resolveWithCatalog(content, products, branches);
  }, [content, catalog]);
}

function RevisionsDialog({ onRestored, disabled }: { onRestored: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const revisions = useQuery({
    queryKey: ['landing-revisions'],
    queryFn: () => landingApi.revisions().then((r) => r.data),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (id: number) => landingApi.restoreRevision(id),
    onSuccess: () => {
      setOpen(false);
      onRestored();
      toast.success('Loaded into the draft. Review it, then publish to make it live.');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <History data-icon="inline-start" />
          History
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Published versions</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Restoring copies a version into your draft. Nothing changes on the site until you publish.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {revisions.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : revisions.isError ? (
          <QueryError error={revisions.error} onRetry={() => void revisions.refetch()} />
        ) : !revisions.data?.length ? (
          <p className="text-sm text-muted-foreground">Nothing has been published yet.</p>
        ) : (
          <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto">
            {revisions.data.map((r: LandingRevisionSummary, i) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {dayjs(r.publishedAt).format('MMM D, YYYY h:mm A')}
                    {i === 0 && <Badge variant="secondary" className="ml-2">Live</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{r.publishedBy ?? 'Unknown'}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(r.id)}
                >
                  <RotateCcw data-icon="inline-start" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export default function LandingEditor() {
  const qc = useQueryClient();
  const query = useQuery<LandingDraftResponse>({
    queryKey: DRAFT_KEY,
    queryFn: () => landingApi.getDraft().then((r) => r.data),
    refetchOnWindowFocus: false,
  });

  const [content, setContent] = useState<LandingContent | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | undefined>();
  // Bumped on every load so uncontrolled inputs (tags) remount with new values.
  const [formVersion, setFormVersion] = useState(0);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');

  // Adopt server data on first load and after every refetch (save, restore…).
  // Done during render rather than in an effect so the form never paints
  // one frame of stale content.
  const [adopted, setAdopted] = useState<LandingDraftResponse | undefined>();
  if (query.data && query.data !== adopted) {
    setAdopted(query.data);
    setContent(query.data.draft);
    setSavedJson(JSON.stringify(query.data.draft));
    setBaseUpdatedAt(query.data.draftUpdatedAt);
    setFormVersion((v) => v + 1);
  }

  const dirty = content != null && JSON.stringify(content) !== savedJson;
  const issue = content ? firstIssue(content) : null;
  const preview = usePreview(content, query.data?.options);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const reload = () => qc.invalidateQueries({ queryKey: DRAFT_KEY });

  const save = useMutation({
    mutationFn: async () => {
      if (!content) return;
      const { data } = await landingApi.saveDraft(content, baseUpdatedAt);
      setSavedJson(JSON.stringify(content));
      setBaseUpdatedAt(data.draftUpdatedAt);
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync();
      await landingApi.publish();
    },
    onSuccess: () => {
      toast.success('Published. The landing page is live.');
      void reload();
      void qc.invalidateQueries({ queryKey: ['landing-revisions'] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const discard = useMutation({
    mutationFn: () => landingApi.discardDraft(),
    onSuccess: () => {
      toast.success('Draft reset to the live page');
      void reload();
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const busy = save.isPending || publish.isPending || discard.isPending;
  const unpublished = dirty || !!query.data?.hasUnpublishedChanges;

  usePageHeader({
    title: 'Landing Page',
    actions: (
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <a href="/" target="_blank" rel="noopener noreferrer">
          <ExternalLink data-icon="inline-start" />
          View site
        </a>
      </Button>
    ),
  });

  if (query.isLoading || (!content && !query.isError)) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
        <Skeleton className="hidden h-[70vh] lg:block" />
      </div>
    );
  }
  if (query.isError || !content || !query.data) {
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }

  const catalog = query.data.options;
  const updateSection = (index: number, next: LandingSection) =>
    setContent({ ...content, sections: content.sections.map((s, i) => (i === index ? next : s)) });
  const addSection = (type: LandingSectionType) => {
    const section = blankSection(type);
    setContent({ ...content, sections: [...content.sections, section] });
    setOpenItems([section.id]);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Status + actions */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {unpublished ? (
            <Badge variant="outline" className="border-warning text-warning-foreground">Unpublished changes</Badge>
          ) : (
            <Badge variant="secondary">Up to date</Badge>
          )}
          <span className="text-muted-foreground">
            {query.data.publishedAt
              ? `Live since ${dayjs(query.data.publishedAt).format('MMM D, h:mm A')}${query.data.publishedBy ? ` by ${query.data.publishedBy}` : ''}`
              : 'Never published. Visitors see the default page.'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <RevisionsDialog onRestored={() => void reload()} disabled={busy || dirty} />
          {query.data.publishedAt && unpublished && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={busy}>
                  <RotateCcw data-icon="inline-start" />
                  Discard
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard unpublished changes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The draft goes back to what is live on the site now. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep editing</AlertDialogCancel>
                  <AlertDialogAction onClick={() => discard.mutate()}>Discard changes</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || !!issue || busy}
            onClick={() => save.mutate(undefined, { onSuccess: () => toast.success('Draft saved') })}
          >
            {save.isPending && !publish.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            Save draft
          </Button>
          <Button size="sm" disabled={!unpublished || !!issue || busy} onClick={() => publish.mutate()}>
            {publish.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            Publish
          </Button>
        </div>
      </div>

      {issue && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Fix this before saving</AlertTitle>
          <AlertDescription>{issue}</AlertDescription>
        </Alert>
      )}

      <ToggleGroup
        type="single"
        value={mobileView}
        onValueChange={(v) => v && setMobileView(v as 'edit' | 'preview')}
        className="self-start lg:hidden"
      >
        <ToggleGroupItem value="edit" size="sm">Edit</ToggleGroupItem>
        <ToggleGroupItem value="preview" size="sm">Preview</ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_1fr]">
        {/* Editor */}
        <div className={cn('flex min-w-0 flex-col gap-3', mobileView === 'preview' && 'hidden lg:flex')}>
          <Accordion
            type="multiple"
            value={openItems}
            onValueChange={setOpenItems}
            className="rounded-lg border bg-card"
            key={formVersion}
          >
            <AccordionItem value="brand" className="px-3">
              <AccordionTrigger className="py-3 text-sm">Brand &amp; navigation</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 pb-4">
                <BrandForm value={content.brand} onChange={(brand) => setContent({ ...content, brand })} />
              </AccordionContent>
            </AccordionItem>
            {content.sections.map((section, i) => (
              <AccordionItem key={section.id} value={section.id} className="px-3 last:border-b-0">
                <div className="flex items-center gap-2">
                  <AccordionTrigger className="min-w-0 py-3 text-sm">
                    <span className="flex min-w-0 flex-col items-start text-left">
                      <span className={cn(!section.visible && 'text-muted-foreground line-through')}>
                        {SECTION_LABELS[section.type]}
                      </span>
                      <span className="w-full truncate text-xs font-normal text-muted-foreground">
                        {sectionSummary(section)}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <Switch
                    checked={section.visible}
                    onCheckedChange={(visible) => updateSection(i, { ...section, visible })}
                    aria-label={`Show ${SECTION_LABELS[section.type]} section`}
                  />
                  <RowControls
                    index={i}
                    count={content.sections.length}
                    label={`${SECTION_LABELS[section.type]} section`}
                    onMove={(from, to) => setContent({ ...content, sections: move(content.sections, from, to) })}
                    onRemove={() => {
                      if (window.confirm(`Remove the ${SECTION_LABELS[section.type]} section? You can undo by discarding the draft.`)) {
                        setContent({ ...content, sections: content.sections.filter((_, j) => j !== i) });
                      }
                    }}
                  />
                </div>
                <AccordionContent className="pb-4">
                  <SectionForm section={section} onChange={(next) => updateSection(i, next)} catalog={catalog} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {content.sections.length < 20 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="self-start">
                  <Plus data-icon="inline-start" />
                  Add section
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  {ADDABLE.map((type) => (
                    <DropdownMenuItem key={type} onSelect={() => addSection(type)}>
                      {SECTION_LABELS[type]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Live preview */}
        <div className={cn('min-w-0', mobileView === 'edit' && 'hidden lg:block')}>
          <div className="sticky top-4 overflow-hidden rounded-lg border shadow-sm">
            <div className="flex items-center gap-1.5 border-b bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-full bg-muted-foreground/30" />
              <span className="size-2.5 rounded-full bg-muted-foreground/30" />
              <span className="size-2.5 rounded-full bg-muted-foreground/30" />
              <span className="ml-2">Preview{dirty ? ' (unsaved)' : ''}</span>
            </div>
            <div
              className="h-[75vh] overflow-y-auto"
              // Links in the preview must not navigate away from the editor.
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest('a')) e.preventDefault();
              }}
            >
              {preview && <LandingRenderer content={preview} className="min-h-0" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
