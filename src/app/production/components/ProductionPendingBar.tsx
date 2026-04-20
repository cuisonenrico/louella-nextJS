'use client';

import { X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  totalPending: number;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

export default function ProductionPendingBar({ totalPending, isSaving, onDiscard, onSave }: Props) {
  if (totalPending <= 0) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-amber-50 border border-amber-400 rounded-md">
      <p className="text-sm text-amber-800 flex-grow">
        {totalPending} unsaved change{totalPending !== 1 ? 's' : ''}
      </p>
      <Button size="sm" variant="outline" className="border-amber-400 text-amber-700" onClick={onDiscard}>
        <X className="h-3.5 w-3.5 mr-1" /> Discard
      </Button>
      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={onSave} disabled={isSaving}>
        {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
        Save Changes
      </Button>
    </div>
  );
}
