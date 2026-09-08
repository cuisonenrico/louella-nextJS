-- Soft delete for material stock cards.
--
-- MaterialInventory was the last operational table the application still
-- hard-deleted, and MaterialAdjustment cascades off it (ON DELETE CASCADE), so
-- removing one stock card destroyed its spoilage and restock history outright —
-- exactly the audit trail AGENTS.md says is never to be lost.
--
-- Additive and nullable, so the frozen Cloud Run image keeps working against
-- this database unchanged: it never writes the column, and its reads simply do
-- not filter on it (a card this app has hidden stays visible over there until
-- the Flutter client is repointed).
--
-- The @@unique([materialId, date]) key is deliberately left alone. Like
-- Inventory, a deleted card keeps its slot and re-entering that day clears the
-- tombstone; a partial unique index would instead allow a pile of dead cards
-- per day, which the old image has no idea how to filter.

-- AlterTable
ALTER TABLE "MaterialInventory" ADD COLUMN     "deletedAt" TIMESTAMP(3);
