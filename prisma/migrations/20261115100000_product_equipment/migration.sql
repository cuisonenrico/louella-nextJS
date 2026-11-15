-- Branch equipment (trays, freezer, estante…) kept on the inventory sheet like
-- the paper sheet did: counted when someone checks, carried over every day
-- otherwise, never ordered or produced.
ALTER TABLE "Product" ADD COLUMN "isEquipment" BOOLEAN NOT NULL DEFAULT false;
