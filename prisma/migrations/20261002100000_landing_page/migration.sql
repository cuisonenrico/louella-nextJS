-- Landing page content: one draft/published document plus append-only history.

-- CreateTable
CREATE TABLE "LandingPage" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "draftUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draftUpdatedById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LandingPage_singleton" CHECK ("id" = 1)
);

-- CreateTable
CREATE TABLE "LandingRevision" (
    "id" SERIAL NOT NULL,
    "content" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" INTEGER,

    CONSTRAINT "LandingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingRevision_publishedAt_idx" ON "LandingRevision"("publishedAt");

-- Register the Landing Page editor screen from src/lib/rbac/features.ts.
-- Grants nothing: role defaults live in ROLE_DEFAULTS in code.
INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  ('landing', 'Landing Page', 'Edit and publish the public landing page', NOW())
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;
