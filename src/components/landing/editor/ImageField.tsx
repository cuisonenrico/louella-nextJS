'use client';

/**
 * Upload / replace / remove one landing image, with its alt text.
 *
 * The API hands out a signed Supabase upload URL; the browser PUTs the file
 * straight to storage (so large photos never pass through a serverless
 * function's 4.5 MB body limit) and only the public URL lands in the draft.
 */
import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { LandingImage } from '@/lib/landing/schema';
import { landingApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

async function uploadImage(file: File): Promise<{ url: string; path: string }> {
  const { data } = await landingApi.uploadUrl(file.type, file.size);
  const res = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'cache-control': 'max-age=31536000' },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Try again.`);
  return { url: data.publicUrl, path: data.path };
}

export function ImageField({
  label,
  value,
  onChange,
  aspect = 'aspect-[4/3]',
  removable = true,
}: {
  label: string;
  value: LandingImage | null;
  onChange: (value: LandingImage | null) => void;
  aspect?: string;
  removable?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const altId = useId();
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      toast.error('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Images must be 8 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const { url, path } = await uploadImage(file);
      const alt = value?.alt || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      onChange({ url, path, alt });
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex gap-3">
        <div className={`relative w-32 shrink-0 overflow-hidden rounded-md border bg-muted ${aspect}`}>
          {value?.url ? (
            <Image src={value.url} alt={value.alt} fill sizes="128px" className="object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon aria-hidden />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-5 animate-spin" aria-label="Uploading" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {value?.url ? 'Replace' : 'Upload'}
            </Button>
            {removable && value?.url && (
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => onChange(null)}>
                <Trash2 data-icon="inline-start" />
                Remove
              </Button>
            )}
          </div>
          {value?.url && (
            <div className="flex flex-col gap-1">
              <Label htmlFor={altId} className="text-xs text-muted-foreground">
                Description (for screen readers and search)
              </Label>
              <Input
                id={altId}
                value={value.alt}
                maxLength={200}
                onChange={(e) => onChange({ ...value, alt: e.target.value })}
              />
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(',')}
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      </div>
    </div>
  );
}
