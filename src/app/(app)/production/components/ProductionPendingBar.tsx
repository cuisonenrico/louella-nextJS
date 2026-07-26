'use client';

import { X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  totalPending: number;
  isSaving: boolean;
  isSaveDisabled?: boolean;
  overAllocatedDetails?: { name: string; overBy: number }[];
  onDiscard: () => void;
  onSave: () => void;
};

export default function ProductionPendingBar({
  totalPending,
  isSaving,
  isSaveDisabled = false,
  overAllocatedDetails,
  onDiscard,
  onSave,
}: Props) {
  if (totalPending <= 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 mb-3 bg-amber-50 border border-amber-400 rounded-md">
      <div className="flex items-center gap-3">
        <p className="text-sm text-amber-800 flex-grow">
          {totalPending} unsaved change{totalPending !== 1 ? 's' : ''}
        </p>
        <Button size="sm" variant="outline" className="border-amber-400 text-amber-700" onClick={onDiscard}>
          <X className="h-3.5 w-3.5 mr-1" /> Discard
        </Button>
        <Button
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-white"
          onClick={onSave}
          disabled={isSaving || isSaveDisabled}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Save Changes
        </Button>
      </div>
      {isSaveDisabled && overAllocatedDetails && overAllocatedDetails.length > 0 && (
        <div className="text-xs text-red-700 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="font-semibold">Cannot save — over-allocated:</span>
          {overAllocatedDetails.map(({ name, overBy }) => (
            <span key={name}><span className="font-medium">{name}</span>: reduce by {overBy}</span>
          ))}
        </div>
      )}
    </div>
  );
}
